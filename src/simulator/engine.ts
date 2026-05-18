import type {
  Flow,
  FlowEdge,
  FlowNode,
  MenuInputKey,
  NodeOf,
} from "@/schema";
import { isAnyPeriodActive } from "@/schema";
import type {
  SideEffect,
  SimulateFn,
  SimulatorInput,
  SimulatorOptions,
  TerminalCode,
  Trace,
  TraceStep,
} from "./types";

const DEFAULT_STEP_LIMIT = 200;

/** ITU phone-keypad map: digit → letters it covers. Used by dial-by-name. */
const KEYPAD: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};

interface Ctx {
  flow: Flow;
  input: SimulatorInput;
  nodesById: Map<string, FlowNode>;
  edgesBySource: Map<string, FlowEdge[]>;
  trace: Trace;
  elapsed_ms: number;
  stepLimit: number;
  pressIndex: number;
  /** Whether ROOT intro has already been played (intro plays once per call). */
  introPlayed: boolean;
  /** Stack of menus we're currently inside, innermost last. Used by `action_nop`
   *  to return control to the caller without disconnecting. */
  menuStack: Array<NodeOf<"menu_root"> | NodeOf<"menu_custom">>;
}

function step(ctx: Ctx, node_id: string | null, node_type: string, message: string) {
  ctx.trace.steps.push({ node_id, node_type, message, elapsed_ms: ctx.elapsed_ms });
}

function tick(ctx: Ctx, ms: number) {
  ctx.elapsed_ms += ms;
}

function findEdge(ctx: Ctx, source: string, handle?: string | null): FlowEdge | undefined {
  const edges = ctx.edgesBySource.get(source) ?? [];
  if (handle === undefined) return edges[0];
  return edges.find((e) => (e.sourceHandle ?? null) === (handle ?? null));
}

function recordEdge(ctx: Ctx, edge: FlowEdge | undefined) {
  if (edge) ctx.trace.visited_edge_ids.push(edge.id);
}

function isPeriodActive(ctx: Ctx, period: string): boolean {
  if (period === "always") return true;
  // 1) Manual override from input wins (useful for tests / what-if scenarios).
  if ((ctx.input.active_periods ?? []).includes(period)) return true;
  // 2) Look up named period definition on the entity and evaluate against the call time.
  const defs = ctx.flow.entity.time_periods?.[period];
  if (defs && defs.length > 0) {
    const date = parseWallClock(ctx.input.time);
    if (date) return isAnyPeriodActive(defs, date);
  }
  return false;
}

/**
 * Parse an ISO-8601 timestamp using its wall-clock components — ignore the timezone
 * offset entirely. This matches how PBX admins think about period gates: "open 8-18 local"
 * means 08:00 on the clock at the caller's site, not 08:00 UTC.
 */
function parseWallClock(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const fallback = new Date(iso);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s] = m;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  );
}

function getNode<K extends FlowNode["type"]>(ctx: Ctx, id: string, kind?: K): NodeOf<K> | undefined {
  const n = ctx.nodesById.get(id);
  if (!n) return undefined;
  if (kind && n.type !== kind) return undefined;
  return n as NodeOf<K>;
}

function terminate(ctx: Ctx, code: TerminalCode, detail?: string): Trace {
  ctx.trace.terminal = code;
  ctx.trace.terminal_detail = detail;
  step(ctx, null, "terminal", `Terminal: ${code}${detail ? ` (${detail})` : ""}`);
  return ctx.trace;
}

function playPrompt(ctx: Ctx, prompt: string | undefined) {
  if (!prompt) return;
  ctx.trace.prompts.push(prompt);
}

function recordSide(ctx: Ctx, eff: Omit<SideEffect, "at_ms">) {
  ctx.trace.side_effects.push({ ...eff, at_ms: ctx.elapsed_ms });
}

function answeringFor(ctx: Ctx, target: string): "answer" | "no_answer" | "busy" | "fail" {
  const behaviors = ctx.input.answering_behavior ?? [];
  const b = behaviors.find((x) => x.target === target);
  if (!b) return "answer";
  if (b.outcome === "answer_after") return "answer";
  if (b.outcome === "never_answer") return "no_answer";
  if (b.outcome === "busy") return "busy";
  return "fail";
}

// -----------------------------------------------------------------------------
// Entry point dispatch

export const simulate: SimulateFn = function simulate(
  flow: Flow,
  input: SimulatorInput,
  opts: SimulatorOptions = {},
): Trace {
  const ctx: Ctx = {
    flow,
    input,
    nodesById: new Map(flow.nodes.map((n) => [n.id, n])),
    edgesBySource: groupEdgesBySource(flow.edges),
    trace: {
      steps: [],
      terminal: "dropped",
      prompts: [],
      side_effects: [],
      visited_edge_ids: [],
    },
    elapsed_ms: 0,
    stepLimit: opts.step_limit ?? DEFAULT_STEP_LIMIT,
    pressIndex: 0,
    introPlayed: false,
    menuStack: [],
  };

  step(ctx, null, "entry", `Caller=${input.caller} Callee=${input.callee} Time=${input.time}`);

  if (flow.entity.type === "auto_attendant") {
    return runAutoAttendant(ctx);
  }
  return runExtension(ctx);
};

function groupEdgesBySource(edges: FlowEdge[]): Map<string, FlowEdge[]> {
  const m = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    const arr = m.get(e.source) ?? [];
    arr.push(e);
    m.set(e.source, arr);
  }
  return m;
}

// -----------------------------------------------------------------------------
// Extension flow

function runExtension(ctx: Ctx): Trace {
  // 1. Evaluate screening rules in order.
  const rules = ctx.flow.nodes
    .filter((n): n is NodeOf<"screening_rule"> => n.type === "screening_rule")
    .filter((n) => n.data.enabled)
    .sort((a, b) => a.data.order - b.data.order);

  for (const r of rules) {
    if (matchesScreening(ctx, r)) {
      step(ctx, r.id, r.type, `Screening rule "${r.data.name}" matched`);
      playPrompt(ctx, r.data.play_before_action);
      return runExtAnsweringMode(ctx, {
        mode: r.data.action_mode,
        ring_timeout_s: 20,
        reject_sip_code: 486,
      });
    }
  }
  step(ctx, null, "screening", "No screening rule matched");

  // 2. Default answering mode.
  const am = ctx.flow.nodes.find(
    (n): n is NodeOf<"answering_mode_ext"> => n.type === "answering_mode_ext",
  );
  if (!am) return terminate(ctx, "dropped", "No answering mode configured");
  step(ctx, am.id, am.type, `Default answering mode: ${am.data.mode}`);
  return runExtAnsweringMode(ctx, am.data);
}

function matchesScreening(
  ctx: Ctx,
  r: NodeOf<"screening_rule">,
): boolean {
  const c = r.data.conditions;
  if (!isPeriodActive(ctx, c.time_period)) return false;
  // caller
  const callerKind = c.caller.kind;
  const v = c.caller.value;
  if (callerKind === "any") {
    /* pass */
  } else if (callerKind === "anonymous") {
    if (ctx.input.caller !== "anonymous") return false;
  } else if (callerKind === "number") {
    if (v && ctx.input.caller !== v) return false;
  } else if (callerKind === "prefix") {
    if (v && !ctx.input.caller.startsWith(v)) return false;
  } else if (callerKind === "regex") {
    if (v && !new RegExp(v).test(ctx.input.caller)) return false;
  } else if (callerKind === "caller_list") {
    // No caller-list lookup in MVP — treat as miss unless value matches caller.
    if (v && ctx.input.caller !== v) return false;
  }
  // callee
  const calleeKind = c.callee.kind;
  const cv = c.callee.value;
  if (calleeKind !== "any" && cv && ctx.input.callee !== cv) return false;
  // mode
  if (c.mode && ctx.input.active_mode && c.mode !== ctx.input.active_mode) return false;
  return true;
}

interface AmInput {
  mode: NodeOf<"answering_mode_ext">["data"]["mode"];
  ring_timeout_s: number;
  reject_sip_code: number;
}

function runExtAnsweringMode(ctx: Ctx, am: AmInput): Trace {
  const mode = am.mode;
  switch (mode) {
    case "reject":
      return terminate(ctx, "rejected", `SIP ${am.reject_sip_code}`);
    case "ring_only":
      return ring(ctx, am.ring_timeout_s, /* fallback */ "dropped");
    case "voicemail_only":
      return goVoicemailExt(ctx);
    case "forward_only":
      return goForwardExt(ctx);
    case "ring_then_voicemail":
      return ring(ctx, am.ring_timeout_s, "voicemail");
    case "ring_then_forward":
      return ring(ctx, am.ring_timeout_s, "forward");
    case "forward_then_voicemail": {
      const t = goForwardExt(ctx);
      if (t.terminal === "forwarded_unanswered" || t.terminal === "dropped") {
        return goVoicemailExt(ctx);
      }
      return t;
    }
    case "ring_forward_voicemail":
      return ring(ctx, am.ring_timeout_s, "forward_then_voicemail");
  }
}

function ring(
  ctx: Ctx,
  timeout_s: number,
  fallback: "voicemail" | "forward" | "forward_then_voicemail" | "dropped",
): Trace {
  step(ctx, null, "ring", `Ringing for up to ${timeout_s}s`);
  const r = answeringFor(ctx, ctx.flow.entity.id);
  if (r === "answer") {
    tick(ctx, 1500);
    applyRecordingIfConfigured(ctx);
    return terminate(ctx, "answered", `Answered by ${ctx.flow.entity.id}`);
  }
  if (r === "busy") return terminate(ctx, "rejected", "Busy");
  if (r === "fail") return terminate(ctx, "dropped", "Network failure");
  tick(ctx, timeout_s * 1000);
  step(ctx, null, "ring", `Ring timeout (${timeout_s}s)`);
  if (fallback === "voicemail") return goVoicemailExt(ctx);
  if (fallback === "forward") return goForwardExt(ctx);
  if (fallback === "forward_then_voicemail") {
    const t = goForwardExt(ctx);
    if (t.terminal === "forwarded_unanswered" || t.terminal === "dropped") {
      return goVoicemailExt(ctx);
    }
    return t;
  }
  return terminate(ctx, "dropped", "No fallback");
}

function goVoicemailExt(ctx: Ctx): Trace {
  const vm = ctx.flow.nodes.find((n): n is NodeOf<"voicemail"> => n.type === "voicemail");
  if (!vm) return terminate(ctx, "dropped", "No voicemail configured");
  step(ctx, vm.id, vm.type, "Voicemail engaged");
  playPrompt(ctx, `voicemail_${vm.data.greeting}`);
  if (vm.data.email_option !== "none" && vm.data.email_address) {
    recordSide(ctx, {
      kind: "email_queued",
      detail: `Voicemail → ${vm.data.email_address} (${vm.data.email_option})`,
    });
  }
  return terminate(ctx, "voicemail_left");
}

function goForwardExt(ctx: Ctx): Trace {
  const fwd = ctx.flow.nodes.find(
    (n) =>
      n.type === "forward_follow_me" ||
      n.type === "forward_advanced" ||
      n.type === "forward_sip_uri" ||
      n.type === "forward_simple",
  );
  if (!fwd) return terminate(ctx, "dropped", "No forwarding configured");
  step(ctx, fwd.id, fwd.type, "Forwarding");

  if (fwd.type === "forward_simple") {
    const data = (fwd as NodeOf<"forward_simple">).data;
    return tryForwardOne(ctx, data.target_number ?? "<unset>", data.timeout_s);
  }
  if (fwd.type === "forward_sip_uri") {
    const data = (fwd as NodeOf<"forward_sip_uri">).data;
    return tryForwardOne(ctx, data.target_uri ?? "<unset>", data.timeout_s);
  }
  if (fwd.type === "forward_follow_me" || fwd.type === "forward_advanced") {
    const data = (fwd as NodeOf<"forward_follow_me" | "forward_advanced">).data;
    const rules = data.rules.filter((r) => r.enabled && isPeriodActive(ctx, r.time_check));
    if (rules.length === 0)
      return terminate(ctx, "forwarded_unanswered", "No enabled forwarding rules");

    const ringMode = data.ring_mode;
    if (ringMode === "simultaneous") return forwardSimultaneous(ctx, rules);
    if (ringMode === "random") return forwardSequentialOrdered(ctx, shuffleDeterministic(ctx, rules), "random");
    if (ringMode === "percentage") return forwardPercentage(ctx, rules);

    return forwardSequentialOrdered(ctx, rules, "sequential");
  }
  return terminate(ctx, "dropped");
}

function forwardSequentialOrdered(
  ctx: Ctx,
  rules: NodeOf<"forward_follow_me" | "forward_advanced">["data"]["rules"],
  mode: "sequential" | "random",
): Trace {
  if (mode === "random") {
    step(
      ctx,
      null,
      "forward",
      `Random-order ring across ${rules.length} target(s): ${rules.map((r) => r.target_node_id).join(", ")}`,
    );
  }
  for (const r of rules) {
    const t = tryForwardOne(ctx, r.target_node_id, r.timeout_s);
    if (t.terminal === "forwarded_answered") return t;
  }
  return terminate(ctx, "forwarded_unanswered", "All forwarding targets unanswered");
}

/**
 * Forwarding with `ring_mode = "simultaneous"`: every enabled, period-active rule rings
 * at once. First answerer wins (tie-break by rule order). The PortaSwitch docs note that
 * when one phone is picked up, others receive a CANCEL with
 *   Reason: SIP; cause=200; text="Call completed elsewhere"
 * — we surface that as a trace step on the answered leg. If everyone fails or times out,
 * simulated time advances by the longest rule timeout and we terminate as unanswered.
 */
function forwardSimultaneous(
  ctx: Ctx,
  rules: NodeOf<"forward_follow_me" | "forward_advanced">["data"]["rules"],
): Trace {
  const targets = rules.map((r) => r.target_node_id).join(", ");
  step(ctx, null, "forward", `Simultaneous ring → ${targets}`);

  for (const r of rules) {
    if (answeringFor(ctx, r.target_node_id) === "answer") {
      tick(ctx, 1500);
      const losers = rules.filter((x) => x.target_node_id !== r.target_node_id);
      if (losers.length > 0) {
        step(
          ctx,
          null,
          "forward",
          `CANCEL → ${losers.map((x) => x.target_node_id).join(", ")} (call completed elsewhere)`,
        );
      }
      applyRecordingIfConfigured(ctx);
      return terminate(ctx, "forwarded_answered", `Answered by ${r.target_node_id}`);
    }
  }

  const longest = rules.reduce((m, r) => Math.max(m, r.timeout_s), 0);
  tick(ctx, longest * 1000);
  return terminate(ctx, "forwarded_unanswered", "All simultaneous targets failed");
}

/**
 * Forwarding with `ring_mode = "percentage"`: pick a single rule weighted by
 * `percentage_weight` (default 1 if unset). Deterministic across runs — the seed is
 * derived from (caller, callee, time) so repeated simulations of the same input always
 * pick the same target. If the chosen target doesn't answer, terminate as unanswered
 * (no retry — the doc describes percentage as "load distribution", not a fallback list).
 */
function forwardPercentage(
  ctx: Ctx,
  rules: NodeOf<"forward_follow_me" | "forward_advanced">["data"]["rules"],
): Trace {
  const weights = rules.map((r) => Math.max(0, r.percentage_weight ?? 1));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return terminate(ctx, "forwarded_unanswered", "All weights are zero");

  const seed = seedFromCall(ctx);
  let cursor = seed * total;
  let picked = rules.length - 1;
  for (let i = 0; i < rules.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) {
      picked = i;
      break;
    }
  }
  const r = rules[picked];
  step(
    ctx,
    null,
    "forward",
    `Percentage pick → ${r.target_node_id} (weight ${weights[picked]}/${total})`,
  );
  const t = tryForwardOne(ctx, r.target_node_id, r.timeout_s);
  if (t.terminal === "forwarded_answered") return t;
  return terminate(ctx, "forwarded_unanswered", `${r.target_node_id} did not answer`);
}

/** Deterministic Fisher–Yates shuffle keyed by the call's identity. */
function shuffleDeterministic<T>(ctx: Ctx, arr: readonly T[]): T[] {
  const out = [...arr];
  const seed = seedFromCall(ctx);
  // Simple LCG seeded from `seed`, used only here to keep the simulator pure.
  let state = Math.floor(seed * 2 ** 31) | 0 || 1;
  const next = () => {
    state = Math.imul(state, 48271) | 0;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** FNV-1a 32-bit hash of (caller, callee, time) → [0, 1). */
function seedFromCall(ctx: Ctx): number {
  const s = `${ctx.input.caller}|${ctx.input.callee}|${ctx.input.time}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0x100000000;
}

function tryForwardOne(ctx: Ctx, target: string, timeout_s: number): Trace {
  step(ctx, null, "forward", `→ ${target} (timeout ${timeout_s}s)`);
  const r = answeringFor(ctx, target);
  if (r === "answer") {
    tick(ctx, 1500);
    applyRecordingIfConfigured(ctx);
    return terminate(ctx, "forwarded_answered", `Answered by ${target}`);
  }
  if (r === "busy") return terminate(ctx, "forwarded_unanswered", `${target} busy`);
  if (r === "fail") return terminate(ctx, "forwarded_unanswered", `${target} network fail`);
  tick(ctx, timeout_s * 1000);
  return ctx.trace; // continue to next rule
}

function applyRecordingIfConfigured(ctx: Ctx) {
  const rec = ctx.flow.nodes.find((n): n is NodeOf<"call_recording"> => n.type === "call_recording");
  if (!rec) return;
  if (rec.data.announce && rec.data.announce_prompt) playPrompt(ctx, rec.data.announce_prompt);
  recordSide(ctx, {
    kind: "recording_started",
    detail: rec.data.send_to_email ? `→ ${rec.data.send_to_email}` : "local",
  });
}

// -----------------------------------------------------------------------------
// Auto attendant flow

function runAutoAttendant(ctx: Ctx): Trace {
  const root = ctx.flow.nodes.find((n): n is NodeOf<"menu_root"> => n.type === "menu_root");
  if (!root) return terminate(ctx, "dropped", "No ROOT menu");

  // Default answering mode.
  const am = ctx.flow.nodes.find(
    (n): n is NodeOf<"answering_mode_aa"> => n.type === "answering_mode_aa",
  );
  if (am) {
    step(ctx, am.id, am.type, `AA answering mode: ${am.data.mode}`);
    if (am.data.mode === "reject") return terminate(ctx, "rejected", `SIP ${am.data.reject_sip_code}`);
    // For MVP, every non-reject mode proceeds to ROOT IVR.
  }

  return runMenu(ctx, root);
}

function runMenu(
  ctx: Ctx,
  menu: NodeOf<"menu_root"> | NodeOf<"menu_custom">,
): Trace {
  if (--ctx.stepLimit <= 0) return terminate(ctx, "dropped", "Step limit exceeded");

  ctx.menuStack.push(menu);
  step(ctx, menu.id, menu.type, `Enter menu ${menu.data.name}`);

  // Active period check.
  if (!isPeriodActive(ctx, menu.data.active_period as string)) {
    step(ctx, menu.id, menu.type, `Menu inactive (period=${menu.data.active_period})`);
    const inactiveId = menu.data.inactive_action_node_id;
    if (inactiveId) return runActionByNodeId(ctx, inactiveId);
    return terminate(ctx, "disconnected", "Inactive menu, no inactive_action configured");
  }

  // Intro prompt — first menu only.
  if (!ctx.introPlayed) {
    playPrompt(ctx, menu.data.intro_prompt);
    ctx.introPlayed = true;
  }
  playPrompt(ctx, menu.data.menu_prompt);

  return consumeInput(ctx, menu);
}

function consumeInput(
  ctx: Ctx,
  menu: NodeOf<"menu_root"> | NodeOf<"menu_custom">,
): Trace {
  const press = ctx.input.press_sequence ?? [];
  const maxErrors = menu.data.max_input_errors ?? 3;
  let attempts = 0;

  // Each iteration consumes either one input attempt or one no-input timeout.
  // After `maxErrors` failures we play the max-fails prompt and disconnect, mirroring
  // PortaSwitch's aa_timeout/aa_disabled/max_fails flowchart.
  while (attempts < maxErrors) {
    // ---- No more pressed keys: handle as no-input timeout. ----
    if (ctx.pressIndex >= press.length) {
      tick(ctx, menu.data.no_input.timeout_s * 1000);

      const niAction = menu.data.actions.no_input ?? menu.data.actions["no_input"];
      if (niAction) {
        step(ctx, menu.id, menu.type, "No input timeout → no_input action");
        return runActionByNodeId(ctx, niAction.target_node_id, niAction.play_before_action);
      }
      if (menu.data.no_input.action_node_id) {
        return runActionByNodeId(ctx, menu.data.no_input.action_node_id);
      }
      attempts += 1;
      step(ctx, menu.id, menu.type, `No input (attempt ${attempts}/${maxErrors})`);
      playPrompt(ctx, menu.data.on_timeout_prompt ?? "aa_timeout");
      if (attempts < maxErrors) playPrompt(ctx, menu.data.menu_prompt);
      continue;
    }

    // ---- Direct-dial: build up an extension match before treating the digit as a menu key. ----
    if (menu.data.allow_direct_dial) {
      const start = ctx.pressIndex;
      const directory = directoryFor(ctx);
      let digits = "";
      let matchedExtension: { extension: string; name: string } | null = null;
      let consumed = 0;
      for (let i = start; i < press.length; i++) {
        const d = press[i];
        if (!/^[0-9]$/.test(d)) break;
        digits += d;
        consumed = i - start + 1;
        const exact = directory.find((e) => e.extension === digits && e.published);
        if (exact) {
          matchedExtension = exact;
          break;
        }
        const couldGrow = directory.some(
          (e) =>
            e.published &&
            e.extension.startsWith(digits) &&
            e.extension.length > digits.length,
        );
        if (!couldGrow) break;
      }
      if (matchedExtension) {
        ctx.pressIndex = start + consumed;
        tick(ctx, (consumed - 1) * 500);
        step(
          ctx,
          menu.id,
          menu.type,
          `Direct-dial extension ${matchedExtension.extension} (${matchedExtension.name})`,
        );
        return terminate(ctx, "answered", `Direct-dial → ${matchedExtension.extension}`);
      }
      // No direct-dial match — fall through, the first digit is still available.
    }

    // ---- Match the next key against the menu's action table. ----
    const key = press[ctx.pressIndex] as MenuInputKey;
    ctx.pressIndex += 1;
    const action = menu.data.actions[key];
    if (action) {
      step(ctx, menu.id, menu.type, `Input '${key}' → ${action.target_node_id}`);
      return runActionByNodeId(ctx, action.target_node_id, action.play_before_action);
    }

    attempts += 1;
    step(ctx, menu.id, menu.type, `Unmatched input '${key}' (attempt ${attempts}/${maxErrors})`);
    playPrompt(ctx, menu.data.on_unavailable_prompt ?? "aa_disabled");
    if (attempts < maxErrors) playPrompt(ctx, menu.data.menu_prompt);
  }

  playPrompt(ctx, menu.data.max_fails_prompt ?? "max_fails");
  return terminate(ctx, "disconnected", `Max input errors (${maxErrors}) exceeded`);
}

function directoryFor(ctx: Ctx) {
  if (ctx.flow.entity.type === "auto_attendant") return ctx.flow.entity.directory ?? [];
  return [];
}

function runActionByNodeId(
  ctx: Ctx,
  id: string,
  playBefore?: string,
): Trace {
  playPrompt(ctx, playBefore);
  const node = ctx.nodesById.get(id);
  if (!node) return terminate(ctx, "dropped", `Action target ${id} not found`);
  return runNode(ctx, node);
}

function runNode(ctx: Ctx, node: FlowNode): Trace {
  if (--ctx.stepLimit <= 0) return terminate(ctx, "dropped", "Step limit exceeded");

  switch (node.type) {
    case "action_disconnect": {
      playPrompt(ctx, node.data.play_before_action);
      return terminate(ctx, "disconnected");
    }
    case "action_voicemail": {
      const mailId = node.data.mailbox_node_id;
      const vm = mailId
        ? getNode<"voicemail">(ctx, mailId, "voicemail")
        : ctx.flow.nodes.find((n): n is NodeOf<"voicemail"> => n.type === "voicemail");
      if (!vm) return terminate(ctx, "dropped", "Voicemail target missing");
      step(ctx, vm.id, vm.type, "Voicemail engaged");
      playPrompt(ctx, `voicemail_${vm.data.greeting}`);
      if (vm.data.email_option !== "none" && vm.data.email_address) {
        recordSide(ctx, {
          kind: "email_queued",
          detail: `Voicemail → ${vm.data.email_address} (${vm.data.email_option})`,
        });
      }
      return terminate(ctx, "voicemail_left");
    }
    case "action_transfer": {
      const tgt = node.data.target_node_id;
      if (!tgt) return terminate(ctx, "dropped", "Transfer target missing");
      return runNode(ctx, ctx.nodesById.get(tgt) ?? node);
    }
    case "action_transfer_e164": {
      const num = node.data.number ?? "<unset>";
      step(ctx, node.id, node.type, `Transfer to E.164 ${num}`);
      const r = answeringFor(ctx, num);
      if (r === "answer") return terminate(ctx, "forwarded_answered", `Answered by ${num}`);
      return terminate(ctx, "forwarded_unanswered", `${num} unreachable`);
    }
    case "action_goto_menu": {
      const tgt = node.data.target_menu_node_id;
      const m = tgt ? ctx.nodesById.get(tgt) : undefined;
      if (m && (m.type === "menu_root" || m.type === "menu_custom")) return runMenu(ctx, m);
      return terminate(ctx, "dropped", "Goto menu target missing");
    }
    case "action_nop": {
      // "Do Nothing": play an optional prompt and return control to the parent
      // menu without counting as an invalid attempt. If we've somehow arrived
      // here without a parent menu (e.g. as a flow entry point), terminate
      // cleanly — there's nowhere to fall back to.
      playPrompt(ctx, node.data.prompt);
      const parent = ctx.menuStack[ctx.menuStack.length - 1];
      if (!parent) return terminate(ctx, "dropped", "Do-nothing action has no parent menu");
      step(ctx, node.id, node.type, `No-op → re-enter ${parent.data.name}`);
      // Replay the menu prompt and resume waiting for the next input. We don't
      // re-push the parent (it's already on the stack), and we don't reset
      // pressIndex — the caller may have queued further keys.
      playPrompt(ctx, parent.data.menu_prompt);
      return consumeInput(ctx, parent);
    }
    case "action_queue": {
      step(ctx, node.id, node.type, `Queue: ${node.data.queue_name ?? "?"}`);
      return terminate(ctx, "answered", "Queue (MVP stub)");
    }
    case "action_dial_by_name": {
      return dialByName(ctx, node);
    }
    case "action_dial_direct": {
      // In MVP we model "press X then collect rest" — assume next press digits form extension.
      return terminate(ctx, "dropped", "Dial-direct standalone not supported in MVP");
    }
    case "action_prompt_extension": {
      playPrompt(ctx, node.data.prompt);
      const press = ctx.input.press_sequence ?? [];
      const max = node.data.max_digits ?? 5;
      // Only accept digit keys (0-9), and clamp to max_digits.
      const collected: string[] = [];
      let i = ctx.pressIndex;
      while (i < press.length && collected.length < max && /^[0-9]$/.test(press[i])) {
        collected.push(press[i]);
        i += 1;
      }
      ctx.pressIndex = i;
      const rest = collected.join("");
      if (!rest) {
        tick(ctx, node.data.timeout_s * 1000);
        return terminate(ctx, "disconnected", "No extension entered");
      }
      const dir = directoryFor(ctx);
      const exact = dir.find((e) => e.extension === rest && e.published);
      if (exact) return terminate(ctx, "answered", `Prompted ext ${exact.extension}`);
      return terminate(
        ctx,
        "dropped",
        `No extension matches ${rest}${collected.length === max ? ` (max ${max} digits)` : ""}`,
      );
    }
    case "action_disa": {
      playPrompt(ctx, node.data.password_prompt);
      return terminate(ctx, "answered", "DISA accepted (MVP stub)");
    }
    case "menu_custom":
    case "menu_root":
      return runMenu(ctx, node);
    case "voicemail": {
      step(ctx, node.id, node.type, "Voicemail engaged");
      playPrompt(ctx, `voicemail_${node.data.greeting}`);
      if (node.data.email_option !== "none" && node.data.email_address) {
        recordSide(ctx, {
          kind: "email_queued",
          detail: `Voicemail → ${node.data.email_address} (${node.data.email_option})`,
        });
      }
      return terminate(ctx, "voicemail_left");
    }
    case "fax_mailbox": {
      step(ctx, node.id, node.type, "Fax mailbox engaged");
      if (node.data.email_address) {
        recordSide(ctx, {
          kind: "fax_stored",
          detail: `Fax → ${node.data.email_address} (${node.data.email_option})`,
        });
      }
      return terminate(ctx, "voicemail_left", "fax stored");
    }
    case "target_extension": {
      const ext = node.data.extension;
      step(ctx, node.id, node.type, `Ringing extension ${ext}`);
      const r = answeringFor(ctx, ext);
      if (r === "answer") {
        applyRecordingIfConfigured(ctx);
        return terminate(ctx, "answered", `ext ${ext}`);
      }
      if (r === "busy") return terminate(ctx, "rejected", `ext ${ext} busy`);
      if (r === "fail") return terminate(ctx, "dropped", `ext ${ext} network fail`);
      return terminate(ctx, "dropped", `ext ${ext} no answer`);
    }
    case "target_external": {
      const num = node.data.number;
      step(ctx, node.id, node.type, `Ringing external ${num}`);
      const r = answeringFor(ctx, num);
      if (r === "answer") return terminate(ctx, "answered", `external ${num}`);
      return terminate(ctx, "dropped", `external ${num} unreachable`);
    }
    case "target_hunt_group_ref": {
      const hg = node.data.label ?? node.data.hunt_group_id;
      step(ctx, node.id, node.type, `Hunt group ${hg}`);
      const r = answeringFor(ctx, node.data.hunt_group_id);
      if (r === "answer") return terminate(ctx, "answered", `hunt group ${hg}`);
      return terminate(ctx, "dropped", `hunt group ${hg} no answer`);
    }
    case "target_sip_uri": {
      step(ctx, node.id, node.type, `Dialing SIP URI ${node.data.uri}`);
      const r = answeringFor(ctx, node.data.uri);
      if (r === "answer") return terminate(ctx, "answered", node.data.uri);
      return terminate(ctx, "dropped", `${node.data.uri} unreachable`);
    }
    case "term_answered":
      return terminate(ctx, "answered");
    case "term_voicemail_left":
      return terminate(ctx, "voicemail_left");
    case "term_forwarded_answered":
      return terminate(ctx, "forwarded_answered");
    case "term_forwarded_unanswered":
      return terminate(ctx, "forwarded_unanswered");
    case "term_rejected":
      return terminate(ctx, "rejected");
    case "term_dropped":
      return terminate(ctx, "dropped");
    default:
      // Walk forward via the first outgoing edge.
      {
        const edge = findEdge(ctx, node.id);
        if (edge) {
          recordEdge(ctx, edge);
          const next = ctx.nodesById.get(edge.target);
          if (next) return runNode(ctx, next);
        }
        return terminate(ctx, "dropped", `Unhandled node type ${node.type}`);
      }
  }
}

function dialByName(ctx: Ctx, node: FlowNode): Trace {
  const announce =
    node.type === "action_dial_by_name" ? Boolean(node.data.announce_extensions) : false;
  const press = ctx.input.press_sequence ?? [];
  // Take next 3 digits as the search query.
  const digits: string[] = [];
  while (digits.length < 3 && ctx.pressIndex < press.length) {
    const d = press[ctx.pressIndex];
    if (!/^[2-9]$/.test(d)) break;
    digits.push(d);
    ctx.pressIndex += 1;
  }
  if (digits.length < 3) return terminate(ctx, "dropped", "Dial-by-name needs 3 digits");
  const directory = directoryFor(ctx);
  const matches = directory.filter((e) => {
    if (!e.published) return false;
    const first3 = e.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    if (first3.length < 3) return false;
    return digits.every((d, i) => KEYPAD[d]?.includes(first3[i]));
  });
  if (matches.length === 0)
    return terminate(ctx, "dropped", `Dial-by-name no match for ${digits.join("")}`);
  if (matches.length === 1) {
    if (announce) playPrompt(ctx, `ext_${matches[0].extension}`);
    return terminate(ctx, "answered", `Dial-by-name → ${matches[0].extension}`);
  }
  if (announce) {
    for (const m of matches) playPrompt(ctx, `ext_${m.extension}`);
  }
  return terminate(ctx, "answered", `Dial-by-name list-select (${matches.length} matches)`);
}

// step is also used by external callers; suppress unused-var warning
void (step as unknown);
void (recordEdge as unknown);

// Re-export TraceStep so consumers can import everything from engine.
export type { TraceStep };
