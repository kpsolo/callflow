const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TabStopType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak
} = require('docx');

const C = {
  primary: "1F4E79", accent: "2E75B6", light: "D5E8F0", alt: "F2F7FB",
  text: "1A1A1A", muted: "595959", rule: "BFBFBF",
  amber: "FFF4E5", amberBorder: "E8A33D",
  green: "E8F5E9", greenBorder: "4CAF50",
  red: "FCE8E8", redBorder: "C62828",
  phase1: "1F4E79", phase2: "2E75B6", phase3: "5B9BD5", phase4: "8FAADC",
};

const border = { style: BorderStyle.SINGLE, size: 4, color: C.rule };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 300, ...(opts.spacing || {}) },
    alignment: opts.alignment,
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.text, ...opts.run })],
  });
}
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.accent, space: 6 } },
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: C.primary })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: C.primary })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: C.accent })],
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 60, line: 280 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.text })],
  });
}
function bulletRich(runs, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 60, line: 280 },
    children: runs.map(r => new TextRun({ font: "Arial", size: 22, color: C.text, ...r })),
  });
}
function spacer() { return new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 80 } }); }

function callout(title, body, kind = "info") {
  let bg, bc;
  if (kind === "warn")  { bg = C.amber; bc = C.amberBorder; }
  else if (kind === "good")  { bg = C.green; bc = C.greenBorder; }
  else if (kind === "bad")   { bg = C.red;   bc = C.redBorder;   }
  else                       { bg = C.light; bc = C.accent;     }
  const cb = { style: BorderStyle.SINGLE, size: 8, color: bc };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: cb, bottom: cb, left: { style: BorderStyle.SINGLE, size: 24, color: bc }, right: cb },
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 160, bottom: 160, left: 200, right: 200 },
      children: [
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: title, font: "Arial", size: 22, bold: true, color: C.primary })],
        }),
        ...(Array.isArray(body) ? body : [body]).map(t =>
          new Paragraph({
            spacing: { after: 60, line: 280 },
            children: [new TextRun({ text: t, font: "Arial", size: 22, color: C.text })],
          })
        ),
      ],
    })] })],
  });
}

function buildTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: cellBorders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: C.primary, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: "Arial", size: 22, bold: true, color: "FFFFFF" })],
      })],
    })),
  });
  const bodyRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders: cellBorders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? "FFFFFF" : C.alt, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      verticalAlign: VerticalAlign.TOP,
      children: (Array.isArray(cell) ? cell : [cell]).map(line =>
        new Paragraph({
          spacing: { after: 40, line: 260 },
          children: [new TextRun({ text: line, font: "Arial", size: 20, color: C.text })],
        })
      ),
    })),
  }));
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });
}

function phaseBadge(text, color) {
  return new Table({
    width: { size: 2400, type: WidthType.DXA },
    columnWidths: [2400],
    rows: [new TableRow({ children: [new TableCell({
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
      width: { size: 2400, type: WidthType.DXA },
      shading: { fill: color, type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 140, right: 140 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, font: "Arial", size: 20, bold: true, color: "FFFFFF", characterSpacing: 60 })],
      })],
    })] })],
  });
}

const children = [];

// COVER
children.push(
  new Paragraph({
    spacing: { before: 2400, after: 240 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "IMPLEMENTATION PLAN  •  v2", font: "Arial", size: 22, bold: true, color: C.accent, characterSpacing: 80 })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Call Flow Studio", font: "Arial", size: 60, bold: true, color: C.primary })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "An easy way to configure call features for PortaOne cloud PBX", font: "Arial", size: 26, italics: true, color: C.muted })],
  }),
  new Paragraph({
    spacing: { before: 1800, after: 80 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Replaces v1.0 — incorporates critique findings and re-positions as a greenfield feature", font: "Arial", size: 22, color: C.muted })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "May 17, 2026", font: "Arial", size: 22, color: C.muted })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// 1. WHAT'S CHANGED FROM v1
children.push(h1("1. What changed from v1, and why"));

children.push(p(
  "v1 was a technically sound plan with optimistic numbers and a wrongly-placed architectural decision. v2 keeps the shape — risk-first sequencing, six phases, the simulator-fidelity gate — and fixes the rest."
));

children.push(h3("Positioning"));
children.push(p(
  "Call Flow Studio is a new feature, not a replacement. It is the easy path to configure call handling in PortaOne cloud PBX: extensions, auto attendants, hunt groups. The legacy per-screen configuration remains available indefinitely. Customers opt in by clicking \"Open in Call Flow Studio\" on any entity, or by creating new entities directly inside the editor."
));
children.push(p(
  "This framing removes two large risks from v1:"
));
children.push(bulletRich([{ text: "No data migration. ", bold: true }, { text: "Existing legacy-configured entities are not auto-converted. Customers re-create or continue using legacy. The product earns adoption by being better, not by force." }]));
children.push(bulletRich([{ text: "No parity-verification pressure. ", bold: true }, { text: "We don't have to prove byte-for-byte equivalence with legacy screens. We have to prove that what the editor saves is what PortaSwitch actually does — which the simulator-fidelity gate already covers." }]));

children.push(h3("What v2 changes vs v1"));
const diffRows = [
  ["Positioning", "v1 implied replacement / migration; v2 is opt-in alongside legacy."],
  ["Self-care integration decision", "Moved from P6 (hidden 3-day task) to P0 (explicit architectural decision)."],
  ["Estimates", "Half-day numbers replaced with S/M/L/XL with day ranges; wall-time multiplier corrected from 1.5× to 2.0×."],
  ["Total timeline", "Was 22 weeks (optimistic). Now 28 weeks honest, with named compression options."],
  ["Missing items added", "Feature flags, error boundaries, copy/paste, empty/error/loading states, security review, on-call, telemetry redaction, schema migration mechanics, rollback drill, support training."],
  ["P0", "Reframed as \"Week 0\" — pre-phase setup, not a delivery phase."],
  ["API integration estimates", "Roughly doubled (P2 and P3) to reflect first-time integration realities."],
  ["Designer allocation", "Increased from 50% to 70% — at 50% the designer was structurally underbooked."],
  ["Data migration", "Removed entirely. Replaced by an entity-level \"open in Call Flow Studio\" entry point."],
];
children.push(buildTable(["Area", "Change"], diffRows, [2600, 6760]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// 2. ESTIMATION MODEL
children.push(h1("2. How we estimate in v2"));

children.push(p(
  "v1 used half-day precision (0.5d, 1.5d). That implies confidence we don't have. v2 uses T-shirt sizes with explicit day ranges. Each task has a size; the range is what one senior frontend engineer should expect from kickoff to merged PR, including the engineer's own review-driven rework but not external review wait time."
));

const sizeRows = [
  ["XS", "< 1 day", "Trivial. A config change, a small refactor, a one-line bugfix."],
  ["S", "1–2 days", "Single component, single concern, well-understood."],
  ["M", "3–5 days", "Multiple components, some new patterns, design iteration likely."],
  ["L", "1–2 weeks", "New subsystem, multiple integrations, design and product input needed."],
  ["XL", "2–4 weeks", "Genuinely large. Should usually be split before commitment."],
];
children.push(buildTable(["Size", "Day range (eng days)", "When it applies"], sizeRows, [800, 1900, 6660]));

children.push(spacer());
children.push(callout(
  "Wall-time math used throughout v2",
  [
    "Engineer days are productive coding/design days. To convert to elapsed wall time for a single engineer, multiply by 2.0 (meetings, code review wait, context switching, unplanned support).",
    "To convert to elapsed wall time for the two-engineer team: sum of engineer days × 2.0 ÷ 2.",
    "Example: a phase totalling 30 eng-days = 30 × 2.0 ÷ 2 = 30 wall days ≈ 6 weeks.",
    "This is the formula behind every phase duration in §4 onwards.",
  ]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// 3. PHASE OVERVIEW
children.push(h1("3. Phase overview"));

children.push(p(
  "Seven phases — counting Week 0 — totalling 28 calendar weeks. Each delivers something a product person can evaluate."
));

const phaseRows = [
  ["W0", "Week 0 — pre-phase setup", "1 wk", "Repo, CI, design tokens, security & self-care decisions resolved. Not a delivery phase."],
  ["P1", "Walking-skeleton canvas", "4 wks", "Hand-author an extension JSON → render → edit → save. Round-trip property tests pass."],
  ["P2", "Extension MVP", "6 wks", "Full extension fidelity: all modes, all forwarding types, screening, voicemail, recording, outgoing. New extension can be created and configured end-to-end inside the editor."],
  ["P3", "Auto attendant + hunt groups", "6 wks", "ROOT + custom menus, all 11 action types, dial-by-name, fax mailbox, hunt groups as first-class entities."],
  ["P4", "Simulator + templates", "4 wks", "Deterministic simulator with path highlighting. Named scenarios saved with the entity. Reseller templates with substitution."],
  ["P5", "Production hardening", "4 wks", "Perf, accessibility, version history, audit log, i18n, error/empty/loading states, security review."],
  ["P6", "GA launch", "3 wks", "Self-care integration validated (decision already made in W0), telemetry, docs, support training, rollback drill, launch."],
];
children.push(buildTable(["Phase", "Name", "Duration", "Outcome"], phaseRows, [800, 2400, 1200, 4960]));

children.push(spacer());
children.push(callout(
  "Compression options if a fixed date forces 22 weeks",
  [
    "Option A — drop reseller templates: cut 1.5 wks from P4. Templates ship in v1.1.",
    "Option B — minimal i18n: ship English only at GA; defer second locale to v1.1. Cuts ~1 wk from P5.",
    "Option C — combine P5 and P6: collapse hardening and launch into a single 5-week phase by deferring audit-log UI and version-history UI (the data is captured server-side either way). Cuts ~2 wks.",
    "Stacking all three brings the timeline to ~22 weeks, but the product loses templates, full i18n, and operator-facing history tools at launch.",
  ]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// WEEK 0
// ====================
children.push(h1("4. Week 0 — Pre-phase setup"));
children.push(phaseBadge("WEEK 0  •  1 WEEK", C.phase1));
children.push(spacer());

children.push(p(
  "Goal: resolve every prerequisite question that would otherwise block or distort later phases. This is not a delivery phase. Nothing user-visible ships. The output is decisions, infrastructure and a green build."
));

children.push(h3("Exit criteria"));
children.push(bullet("Three architectural decisions documented as ADRs: self-care integration model, security review approach, and feature-flag infrastructure."));
children.push(bullet("`pnpm dev` boots an empty <ReactFlow /> page; CI is green on lint, typecheck, Vitest, Playwright smoke."));
children.push(bullet("Staging environment auto-deploys; Sentry and analytics SDKs wired with PII redaction in place."));
children.push(bullet("Design tokens land in Tailwind; dark-mode toggle works end-to-end."));
children.push(bullet("Backend liaison's calendar shows ≥10% time blocked for Call Flow Studio through end of P3."));
children.push(bullet("Staging PortaSwitch environment is accessible with at least one realistic customer dataset loaded."));

children.push(h3("Tasks"));
const w0Rows = [
  ["W0-01", "Self-care integration ADR", "Decide how Call Flow Studio mounts inside PortaSwitch self-care. Three options on the table: shared SPA (host upgrades to React 19), iframe, or standalone with deep links. Decision driven by host's current React version and ops appetite. ADR signed by eng lead + platform lead.", "M"],
  ["W0-02", "Security review ADR", "Define threat model and what reviews must pass before GA. Output: a checklist (threat model, dep audit, pen test, PII handling). No actual review yet — just the plan.", "S"],
  ["W0-03", "Feature flag infrastructure", "Wire the platform's existing flag system (or pick one if none exists) so we can gate Call Flow Studio per customer. Verified by toggling a hello-world component on/off.", "M"],
  ["W0-04", "Repo + Vite + React 19 + TS strict", "Scaffold, tsconfig strict, ESLint, Prettier. Resolve Tailwind 4 + React Flow 12 import order.", "S"],
  ["W0-05", "CI pipeline", "GitHub Actions: typecheck, ESLint, Vitest, Playwright smoke. Secrets and deploy keys. Source-map upload to Sentry. Browser provisioning for Playwright.", "M"],
  ["W0-06", "Staging deploy", "Auto-deploy main to a staging URL. Verified end-to-end.", "S"],
  ["W0-07", "Sentry + analytics with PII redaction", "Both SDKs wired. Allow-list approach: phone numbers, emails, DIDs, voicemail content never leave the browser. Verified by deliberately throwing with PII in the payload.", "M"],
  ["W0-08", "Design tokens + dark mode", "PRD palette in Tailwind. shadcn/ui themed accordingly. React Flow `colorMode` toggle wired to a Zustand slice. Persisted across reloads.", "S"],
  ["W0-09", "Zustand store skeleton + error boundaries", "`useFlowStore` slice pattern with `nodes`, `edges`, `selectedNodeId`, `viewport`. Top-level error boundary catches and renders a recovery UI; per-node error boundary prevents one bad node from crashing the canvas.", "S"],
  ["W0-10", "Repo conventions", "README, CONTRIBUTING.md, PR template referencing T-IDs, Conventional Commits, branch protection rules.", "S"],
  ["W0-11", "Staging PortaSwitch access verified", "Backend liaison confirms the staging environment, credentials issued, at least one real-shaped customer dataset loaded.", "S"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], w0Rows, [900, 2400, 5160, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~12 days. Wall time at 2.0× across two engineers ≈ 1.2 weeks. We budget a calendar week + 2 days buffer for decisions to land. Items in italics (W0-01, W0-02) are decisions; if either slips, do not start P1 — fix the decision first."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// PHASE 1
// ====================
children.push(h1("5. Phase 1 — Walking-skeleton canvas (weeks 2–5)"));
children.push(phaseBadge("PHASE 1  •  4 WEEKS", C.phase1));
children.push(spacer());

children.push(p(
  "Goal: prove the highest-risk hypothesis — can we faithfully represent a PortaSwitch routing flow as a typed React Flow graph and round-trip it through JSON without loss? End the phase able to demonstrate: hand-author an extension flow as JSON → load it → see typed custom nodes connected → edit via inspector → export and diff."
));

children.push(h3("Exit criteria"));
children.push(bullet("JSON round-trip: import → render → edit → export. Re-importing the exported JSON produces a structurally identical canvas. Property-based tests gate this."));
children.push(bullet("At least three custom node types render with typed handles: Incoming Call, Default Answering Mode (3 of 8 modes), Voicemail terminal."));
children.push(bullet("Inspector pattern locked: one decision (hand-written vs schema-driven) made, all subsequent nodes follow it."));
children.push(bullet("Zod schemas validate imports with clear path-based error messages."));
children.push(bullet("Position-canonicality decision made: positions are stored in JSON, not recomputed."));

children.push(h3("Tasks"));
const p1Rows = [
  ["P1-01", "Domain types & Zod schemas (v0.1)", "Inferred TS types via `z.infer`. Scope: FlowDocument, FlowEntity (extension only), three node types, Edge, SchemaVersion. Stored under `src/schema/v0.1/`. Documented as throwaway — will be rewritten at P2 boundary.", "M"],
  ["P1-02", "Inspector pattern decision + scaffold", "Decide hand-written-per-node vs schema-driven rendering. ADR captures the trade-off. Implement the chosen pattern with one example node. shadcn/ui Sheet as the container.", "M"],
  ["P1-03", "Store actions + patch-based history", "Zustand actions: addNode, removeNode, updateNodeData, addEdge, removeEdge. History via Immer patches (not snapshots) — cap at 100 entries. Cmd+Z / Cmd+Shift+Z bindings.", "M"],
  ["P1-04", "Custom node: Incoming Call", "Renders DID and entity name. One source handle. NodeProps typed via generic.", "S"],
  ["P1-05", "Custom node: Default Answering Mode (3 modes)", "Renders chosen mode + timeout. Mode-conditional target handles (ring / forward / voicemail). Mode chosen via inspector. Three modes wired: Ring only, Voicemail only, Ring then voicemail. Other 5 modes wait for P2.", "M"],
  ["P1-06", "Custom node: Voicemail terminal", "Greeting type + email option summary. One target handle.", "S"],
  ["P1-07", "JSON import with validation", "Drag-and-drop or paste. Zod validation. On failure: path + message per error. On success: replaces current flow.", "M"],
  ["P1-08", "JSON export", "Wrap `toObject()` in schema_version envelope. Download as `.cflow.json`. Pretty-printed, deterministic key order.", "S"],
  ["P1-09", "Round-trip property tests", "Vitest + fast-check. Property: import(export(import(json))) === import(json) for seed flows. Gating test for the phase.", "M"],
  ["P1-10", "Reference fixture: extension-basic.cflow.json", "Hand-authored. Reviewed with QA. Used by tests and demos.", "S"],
  ["P1-11", "Canvas controls", "Pan/zoom/minimap/dotted background/snap-to-grid/fit-view. Keyboard shortcuts cheatsheet (Cmd+/).", "S"],
  ["P1-12", "Empty / error / loading states (v1)", "Empty: \"no flow loaded — import or create.\" Error: clear retry. Loading: skeleton + spinner. These are placeholders; final designs land in P5.", "S"],
  ["P1-13", "Phase 1 demo + sign-off", "Recorded walkthrough: open fixture → edit a field → export → diff. Product reviews. Gates P2.", "XS"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p1Rows, [800, 2400, 5260, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~28 days. Wall time at 2.0× across two engineers ≈ 2.8 weeks. 4 calendar weeks accommodates the inspector-pattern ADR cycle and one design review on the custom node visual system."));

children.push(callout(
  "Decision deferred from PRD §17",
  [
    "Time-period import semantics — \"should imports introduce new time periods or must they be pre-defined?\" — must be answered before P2 begins.",
    "v2 default if no decision: imports may reference time-period IDs but never create them. Creation is a separate explicit action with its own dialog.",
    "If product wants imports to create periods, that adds ~3 days to P2-11.",
  ],
  "warn"
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// PHASE 2
// ====================
children.push(h1("6. Phase 2 — Extension MVP (weeks 6–11)"));
children.push(phaseBadge("PHASE 2  •  6 WEEKS", C.phase2));
children.push(spacer());

children.push(p(
  "Goal: end-to-end fidelity for extensions. After this phase, an administrator can create a new extension entirely inside Call Flow Studio and have it function in PortaSwitch — every primitive the platform supports for extensions has a representation here. Auto attendants and hunt groups still wait."
));

children.push(h3("Exit criteria"));
children.push(bullet("All 8 default answering modes are configurable with per-mode timeout where applicable."));
children.push(bullet("All 4 forwarding types (Follow-me, Advanced, SIP URI, Simple) work end-to-end with their per-rule fields, ordering, and enabled/disabled toggle."));
children.push(bullet("Screening rules with time/caller/callee/mode conditions and the 8 action terminators."));
children.push(bullet("Voicemail with all 4 greeting types and 5 email options. Call recording with announcement + email."));
children.push(bullet("Outgoing pane: call barring, recording, service unblock code."));
children.push(bullet("Distinctive ring as a property of Ring nodes."));
children.push(bullet("Validation engine fires inline badges + Issues panel per PRD §9.5."));
children.push(bullet("A new extension can be created in-editor and saved to PortaSwitch; reloading from PortaSwitch produces the same canvas."));

children.push(h3("Tasks — shared components first"));
const p2sharedRows = [
  ["P2-01", "Domain types & Zod (v0.2)", "Expand schema to cover all extension primitives. Bump to v0.2. The throwaway v0.1 schema is retired. Includes screening rule conditions, forwarding rule types, voicemail config, recording config.", "M"],
  ["P2-02", "Rule-row component (shared)", "Reusable inline row with drag-handle, enabled toggle, delete. Used by Follow-me, Advanced forwarding, and screening rules. Built once.", "M"],
  ["P2-03", "Target picker (shared)", "Picks extension / E.164 number / SIP URI / hunt group (HG stub for now). Used by every forwarding type and many screening actions.", "M"],
  ["P2-04", "Time-period picker", "shadcn/ui Select bound to the customer's pre-defined time periods (fetched via TanStack Query, cached).", "S"],
  ["P2-05", "Caller-list picker", "Picker for named caller lists with inline create-new. Used by screening rules.", "S"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p2sharedRows, [800, 2400, 5260, 900]));

children.push(spacer());

children.push(h3("Tasks — incoming nodes"));
const p2inRows = [
  ["P2-06", "Node: Ring", "Source: extension. Outputs: answered, unanswered. Properties: distinctive-ring toggle, timeout (when parent mode requires).", "S"],
  ["P2-07", "Node: Forward (Follow-me)", "Uses P2-02 rule-row. Add-rule button. Per-rule: target (P2-03), time-check (P2-04), timeout, enabled.", "M"],
  ["P2-08", "Node: Forward (Advanced)", "Extends Follow-me with per-rule SIP proxy and ring-mode (sequential / simultaneous).", "S"],
  ["P2-09", "Node: Forward (SIP URI)", "Single target with SIP proxy and timeout.", "S"],
  ["P2-10", "Node: Forward (Simple)", "Single target number with timeout.", "XS"],
  ["P2-11", "Node: Voicemail (extension)", "Greeting (Standard / Personal / Name / Extended absence). PIN / auto-play / date-time toggles. Email-option (None / Forward / Forward as attachment / Copy / Notify). Email address conditional on option.", "M"],
  ["P2-12", "Node: Call Recording", "Toggles for announcement and send-to-email. Email input. Attaches as property to Ring nodes.", "S"],
  ["P2-13", "Default Answering Mode — all 8 modes", "Extend P1-05 to all 8 modes. Mode-specific output handles. Mode-specific timeout visibility. Validation: target nodes exist for active outputs.", "M"],
  ["P2-14", "Screening Rule node", "Most complex node. Stacks left-edge. Sub-form: conditions (time / caller / callee / mode) + action terminator selector + optional response message. Reuses P2-02 rule-row patterns. Drag-reorder reflects rule_order. First-match-wins documented.", "L"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p2inRows, [800, 2400, 5260, 900]));

children.push(spacer());

children.push(h3("Tasks — outgoing, validation, API"));
const p2outRows = [
  ["P2-15", "Outgoing pane", "Tabbed UI on the entity: Incoming (canvas) | Outgoing (form). Outgoing is a flat form, not a graph. Barring picker, recording form (reuses P2-12 fields), service unblock code toggle + PIN field.", "M"],
  ["P2-16", "Validation engine — framework", "Pluggable rules pipeline. Each rule: condition function + severity + message. Wired to node badges and the Issues panel.", "M"],
  ["P2-17", "Validation engine — PRD §9.5 rules", "Implement all rules listed in the PRD: reachability, cycles, reference integrity, time-period definition, voicemail email config, ROOT-menu constraints (deferred from AA work but rule lives here). Each rule is half a day; sum to one solid week.", "L"],
  ["P2-18", "Issues panel", "Dockable bottom panel. Click-to-locate centers + zooms. Severity filter. Live updates.", "S"],
  ["P2-19", "Auto-layout v1 (ELK layered)", "elkjs with the layered algorithm, LR direction. Auto-layout button. Code-split so ELK loads on demand only.", "S"],
  ["P2-20", "Copy/paste between entities", "Cmd+C / Cmd+V on screening rules, forwarding rules, and individual nodes. Clipboard format is JSON conforming to the schema. Cross-entity paste validates references.", "S"],
  ["P2-21", "PortaSwitch read API integration", "TanStack Query against extension config, time periods, caller lists. Adapter layer maps API → domain. Realistic first-time integration estimate; assume two iterations as we discover shape mismatches.", "L"],
  ["P2-22", "PortaSwitch write API integration", "Save path. Optimistic update with rollback on failure. Atomic at entity level. Same iteration assumption as P2-21.", "L"],
  ["P2-23", "Conflict detection on save", "If the entity changed in PortaSwitch since we loaded, surface a clear \"someone else (or another tool) edited this\" warning. Offer reload or force-save.", "S"],
  ["P2-24", "Phase 2 demo + sign-off", "Demo: create a new extension in-editor → configure across all primitives → save → reload from PortaSwitch → identical state.", "XS"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p2outRows, [800, 2400, 5260, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~45 days. Wall time at 2.0× across two engineers ≈ 4.5 weeks. 6 calendar weeks accommodates two backend joint reviews on API shape (mid-phase and pre-merge) and one design review on the screening-rule node."));

children.push(callout(
  "P2-21 and P2-22 are the riskiest tasks in this phase",
  [
    "First-time integration with PortaSwitch APIs will surface shape mismatches. We have budgeted for two iterations (initial implementation + one round of fixes).",
    "Mitigation: pre-P2 backend joint review of expected request/response shapes against our Zod schemas. If the gap is large, P2-21 may extend by ~3 days.",
    "If the API is missing fields we need (likely for screening rule details or recording config), we either negotiate additions with backend or document them as v1.1 work and adjust scope.",
  ],
  "warn"
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// PHASE 3
// ====================
children.push(h1("7. Phase 3 — Auto attendant + hunt groups (weeks 12–17)"));
children.push(phaseBadge("PHASE 3  •  6 WEEKS", C.phase2));
children.push(spacer());

children.push(p(
  "Goal: bring auto attendants and hunt groups to the same fidelity as extensions. After this phase, every entity type in PortaSwitch PBX has a complete representation in Call Flow Studio. Simulator still waits for P4 — everything it needs to simulate against is now modelled."
));

children.push(h3("Exit criteria"));
children.push(bullet("ROOT menu (singleton, undeleteable, unrenamable) plus arbitrary custom menus per auto attendant."));
children.push(bullet("All 11 menu action types, each as a typed action edge."));
children.push(bullet("Dial-by-name with published / excluded toggle on extensions."));
children.push(bullet("Inter-menu Go-to-Menu edges between menus on the canvas."));
children.push(bullet("AA default answering mode (all 8 IVR-variant modes) + Unified Messaging + Fax mailbox."));
children.push(bullet("Hunt group as a first-class entity (members, ring policy, wrap-up, diversion inhibitor)."));
children.push(bullet("Cross-entity JSON import: an AA export references hunt groups; importing brings both in with references intact."));

children.push(h3("Tasks — auto attendant"));
const p3aRows = [
  ["P3-01", "Domain types & Zod (v0.3)", "Schema covers AA entity, Menu nodes, all 11 action types, IVR-variant default modes, fax mailbox config, cross-entity references.", "M"],
  ["P3-02", "Entity switcher in top bar", "Switch between editing extension / AA / hunt group. Persists last-opened per user. Lists all entities the user has access to.", "S"],
  ["P3-03", "Node: ROOT Menu", "Singleton per AA. Name disabled, time-check fixed to \"always\". Fields: intro prompt, menu prompt, no-input config, interdigit timeout, allow-direct-dial toggle, inactive action.", "M"],
  ["P3-04", "Node: Custom Menu", "Same shape as ROOT but with editable name and time-check.", "S"],
  ["P3-05", "Menu action table component", "Per-input table inside each menu node: digit (0-9, *, #) + Fax + No-input events. Each row: action selector, play-before-action toggle, prompt picker, target. This is the shared scaffold for the 11 action types.", "L"],
  ["P3-06", "Actions — Transfer + Transfer to E.164 + Voicemail/Fax bound", "Three simple actions sharing inline editor patterns.", "M"],
  ["P3-07", "Actions — Prompt for Extension + Dial Extension Directly", "Dial-Directly has a non-obvious validation: digit must equal first digit of at least one published extension; surface conflicts.", "M"],
  ["P3-08", "Action — Dial-by-name", "Inline UX; refers to AA-level config (P3-12).", "S"],
  ["P3-09", "Action — Disconnect", "Play-before-action prompt picker.", "XS"],
  ["P3-10", "Action — Menu (jump)", "Target menu picker (any menu in this AA, including ROOT). Renders as an inter-menu edge on the canvas.", "S"],
  ["P3-11", "Actions — DISA + Call Queue", "Two separate actions with separate inspector forms. DISA: PIN policy picker. Call Queue: queue picker (queues referenced only — full queue editor is a separate epic).", "M"],
  ["P3-12", "AA dial-by-name config", "Per-AA toggle: system-default vs custom prompt. Per-extension \"published\" toggle requires cross-entity write. Design pattern: an \"edit related entity\" overlay rather than navigating away.", "M"],
  ["P3-13", "Node: AA Voicemail + Fax Mailbox", "Voicemail mirrors P2-11 (reuses component). Fax mailbox is delivery-only — no greeting; same 5 email options.", "M"],
  ["P3-14", "AA default answering mode (8 IVR variants)", "Reuses the P2-13 component with IVR-variant labels.", "S"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p3aRows, [800, 2400, 5260, 900]));

children.push(spacer());

children.push(h3("Tasks — hunt groups & cross-cutting"));
const p3bRows = [
  ["P3-15", "Hunt Group entity (editor scope)", "New entity. Editor only — runtime state (logged-in/out) is read-only display from backend. Fields: members (reorderable list of extensions), ring policy, wrap-up seconds, diversion inhibitor toggle, group identity caller-ID.", "L"],
  ["P3-16", "Hunt-group runtime status display", "Show each member's current stop/resume state (fetched, cached, not editable in v1).", "S"],
  ["P3-17", "Hunt-group references as targets", "Add hunt groups to the target picker (P2-03). Schema updates already in P3-01.", "S"],
  ["P3-18", "AA outgoing pane", "Mirror of the extension outgoing pane. Reuses P2-15 components.", "S"],
  ["P3-19", "Validation rules — AA & hunt groups", "Extend the engine: ROOT menu integrity, no orphan menus, action references resolve, hunt group not empty, no Dial-Directly digit conflicts.", "M"],
  ["P3-20", "Auto-layout tuning for AA graphs", "ELK options for menu-node sizing and inter-menu edge routing. May need a separate layout preset.", "S"],
  ["P3-21", "Cross-entity JSON import", "Exports and imports preserve cross-references. Pre-import preview shows what will be created vs referenced.", "M"],
  ["P3-22", "PortaSwitch API integration — AA & hunt groups", "Read & write paths for both entity types. Adapter layer extended. Same iteration assumption as P2-21 — AAs are more complex than extensions due to menu trees.", "L"],
  ["P3-23", "Phase 3 demo + sign-off", "Demo: from scratch, configure a 3-department auto attendant using only the editor — dial-by-name, after-hours menu, hunt group for support — save, reload, identical state.", "XS"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p3bRows, [800, 2400, 5260, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~50 days. Wall time at 2.0× across two engineers ≈ 5 weeks. 6 calendar weeks accommodates the cross-entity write pattern design review (P3-12) and one backend joint review on AA + HG API shape."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// PHASE 4
// ====================
children.push(h1("8. Phase 4 — Simulator, templates, schema freeze (weeks 18–21)"));
children.push(phaseBadge("PHASE 4  •  4 WEEKS", C.phase3));
children.push(spacer());

children.push(p(
  "Goal: deliver the three features that move Call Flow Studio from \"a nicer UI\" to \"a tool that prevents misconfigurations before they ship\": deterministic simulator, named scenarios that persist with the entity, reseller templates. JSON schema is frozen at v1.0 at the end of this phase."
));

children.push(h3("Exit criteria"));
children.push(bullet("Simulator runs any (caller, callee, time, mode, press-sequence) tuple against any entity flow and produces a deterministic step-by-step trace."));
children.push(bullet("Trace renders as a highlighted path on the canvas with elapsed simulated time per step."));
children.push(bullet("Scenarios saved on the entity travel with the JSON export; can be re-run as a batch."));
children.push(bullet("Reseller templates exportable and applicable with a guided substitution dialog."));
children.push(bullet("JSON schema_version 1.0 frozen and reviewed; two-major import-compat commitment documented."));
children.push(bullet("Simulator-fidelity gate: validated against ≥20 real flows in staging PortaSwitch; terminal-outcome matches for all."));

children.push(h3("Tasks — simulator"));
const p4aRows = [
  ["P4-01", "Simulator engine — extensions", "Pure function (flow, input) → trace. Implements PRD §13.1: screening evaluation order, default answering mode fallback, mode-specific terminators, recording side-effects. Zero React dependencies; lives in `src/sim/`.", "L"],
  ["P4-02", "Simulator engine — auto attendants", "PRD §13.2: ROOT-first traversal, active-period gating, intro/menu prompts, interdigit-timeout vs direct-dial precedence, menu jumps with cycle detection, fax event handling.", "L"],
  ["P4-03", "Simulator engine — hunt groups", "Iterate members per ring policy. Stop/resume state respected. Diversion inhibitor honoured.", "M"],
  ["P4-04", "Determinism property tests", "Property: identical input → identical trace across 1000 runs. Tie-breaker semantics for simultaneous ring documented and tested.", "S"],
  ["P4-05", "Simulator UI panel", "Right-hand drawer with inputs (caller, callee, time, mode, press sequence), Run button, step-by-step trace list, terminal-outcome banner.", "M"],
  ["P4-06", "Path highlighting on canvas", "Traversed edges animate + brighten; non-traversed fade. Click-to-locate from trace row. Toggle to show/hide highlighting. Includes one design review on the playback UX (real-time vs sped-up vs step-through).", "M"],
  ["P4-07", "Side-effects in trace", "Surface recording-started, email-queued, fax-stored events inline.", "S"],
  ["P4-08", "Simulator-fidelity validation", "Sample 20 real flows from staging customers (PII-sanitised). Run the simulator's terminal outcome against PortaSwitch's actual outcome for each. Fix discrepancies (they are simulator bugs).", "L"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p4aRows, [800, 2400, 5260, 900]));

children.push(spacer());

children.push(h3("Tasks — scenarios, templates, schema freeze"));
const p4bRows = [
  ["P4-09", "Scenarios storage + UI", "Per-entity list of named (caller, callee, time, mode, press_sequence, expected_terminal) tuples. Sidebar listing. Persisted in the entity's JSON.", "M"],
  ["P4-10", "Scenarios batch run", "Run all scenarios for an entity; surface pass/fail with delta. Enables regression testing of a flow before save.", "S"],
  ["P4-11", "Template export", "Mark a flow as template; export strips customer identifiers (extensions, DIDs, emails) and replaces with named slots.", "M"],
  ["P4-12", "Template import with substitution", "Import detects template marker; opens guided form for slot values before commit. Substituted JSON then flows through normal validation.", "M"],
  ["P4-13", "Pre-import preview (any import)", "Diff of what will be created / replaced / skipped. Conflict resolution: Skip / Overwrite / Rename per entity. Cross-entity references shown.", "M"],
  ["P4-14", "Schema migration mechanics", "How v1.0 imports older v0.x exports (we won't need it long-term, but the mechanism must exist before freeze). Up-conversion function per minor version. Tested with seed fixtures.", "S"],
  ["P4-15", "Schema v1.0 freeze + review", "Engineering produces the artifact (1 day). Review session with product, backend, reseller cohort representative (1 wk elapsed for sign-off). Versioning policy published. JSON Schema (.schema.json) published alongside TS types.", "S"],
  ["P4-16", "Starter template gallery (read-only)", "3–5 templates bundled with the product: small office, 3-department reception, after-hours voicemail-only, support hunt group, IVR-only DID. Customer-uploadable library is post-GA.", "M"],
  ["P4-17", "Phase 4 demo + sign-off", "Demo: load an entity, run a scenario, see it pass; introduce a bug; scenario fails; fix; pass. Apply a template to a new customer.", "XS"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p4bRows, [800, 2400, 5260, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~37 days. Wall time at 2.0× across two engineers ≈ 3.7 weeks. 4 calendar weeks accommodates the schema freeze sign-off cycle and the simulator-fidelity validation."));

children.push(callout(
  "Simulator-fidelity gate (blocks P5)",
  [
    "Definition: simulator's terminal outcome matches PortaSwitch's actual outcome for the same (caller, callee, time, mode, press-sequence) tuple, on at least 20 real flows.",
    "Flow sampling: 7 extensions, 7 auto attendants, 6 hunt groups. Mix of simple and complex. Must include at least 3 with screening rules, 3 with multi-menu AAs, 3 with diversion-inhibited hunt groups.",
    "\"Matches\" means terminal outcome only at this gate. Side-effects (recording, email) tracked as warnings, not blockers.",
    "Discrepancies are simulator bugs (PortaSwitch is the source of truth). Fix list logged; all critical bugs gate P5 start.",
  ]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// PHASE 5
// ====================
children.push(h1("9. Phase 5 — Production hardening (weeks 22–25)"));
children.push(phaseBadge("PHASE 5  •  4 WEEKS", C.phase3));
children.push(spacer());

children.push(p(
  "Goal: take the feature-complete editor and harden it for production. Performance, accessibility, version history, audit log, internationalisation, polished error/empty/loading states, security review."
));

children.push(h3("Exit criteria"));
children.push(bullet("500-node flow: pan and zoom at ≥60fps; auto-layout completes in <1 second on a mid-range laptop."));
children.push(bullet("Initial bundle under 250 KB gzipped (ELK and html-to-image code-split)."));
children.push(bullet("WCAG 2.1 AA compliance verified by axe-core in CI plus a manual screen-reader pass."));
children.push(bullet("Last 30 versions of each entity retained with restore."));
children.push(bullet("Audit log: every save recorded with author, timestamp, JSON diff."));
children.push(bullet("All UI strings localisable; one non-English locale live end-to-end."));
children.push(bullet("Empty, error, loading, permission-denied states designed and implemented for every screen."));
children.push(bullet("Security review checklist (W0-02) passes: threat model, dep audit, pen test, PII handling."));

children.push(h3("Tasks"));
const p5Rows = [
  ["P5-01", "Performance harness", "Generate synthetic 500-node flows. Measure pan, zoom, auto-layout, save. Run in CI; PRs fail on regression.", "S"],
  ["P5-02", "Perf pass — rendering", "onlyRenderVisibleElements where appropriate. Memoise custom nodes. Audit Zustand selectors with useShallow.", "M"],
  ["P5-03", "Perf pass — bundle", "Code-split ELK, html-to-image, heavy node types. Verify initial load <250 KB gzipped.", "S"],
  ["P5-04", "Accessibility audit + remediation", "axe-core in Playwright. Manual screen-reader pass (NVDA + VoiceOver). Keyboard nav verification on every screen. Fix findings.", "L"],
  ["P5-05", "Version history backend integration", "Backend persists last 30 versions per entity (backend work tracked separately; this task is the frontend consumer). UI: history drawer with timestamps, authors, restore.", "M"],
  ["P5-06", "Audit log UI", "Per-entity history view: diff per save, author, timestamp, exportable as CSV.", "M"],
  ["P5-07", "i18n scaffolding", "Adopt react-i18next. String extraction across the codebase (tedious but mechanical). Locale switcher. Time zone display follows user's PortaBilling time zone.", "L"],
  ["P5-08", "Second locale (German or Spanish)", "Pick based on reseller demand. Translation handled externally; this task verifies the pipeline end-to-end with one locale wired through.", "M"],
  ["P5-09", "Empty / error / loading / permission-denied states (final)", "Replace the P1-12 placeholders. Design-led pass across every screen. Documented in Storybook.", "M"],
  ["P5-10", "\"Someone else opened this\" indicator", "Live indicator (e.g., \"Marco opened this 3 minutes ago\"). No real-time collab — just clear signalling. Real-time editing is post-GA.", "S"],
  ["P5-11", "Load-test the import path", "5000-node JSON import; verify graceful handling, time-to-render, and a friendly limit-exceeded UX above some threshold.", "S"],
  ["P5-12", "Security review execution", "Dep audit (npm audit, Snyk). Threat-model walkthrough. Pen test (internal or external per W0-02 ADR). Remediate findings.", "L"],
  ["P5-13", "Reseller beta cohort", "10 reseller partners onboarded with hands-on time. Weekly feedback. Triage into bug fixes vs post-GA backlog. (PM-led; 0 eng days but real calendar time.)", "—"],
  ["P5-14", "Phase 5 demo + sign-off", "Demo: load a 500-node flow without lag; switch to German UI; restore a previous version; review the audit log.", "XS"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p5Rows, [800, 2400, 5260, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~37 days. Wall time at 2.0× across two engineers ≈ 3.7 weeks. Plus ~3 PM days for beta cohort coordination, parallel to eng work."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ====================
// PHASE 6
// ====================
children.push(h1("10. Phase 6 — GA launch (weeks 26–28)"));
children.push(phaseBadge("PHASE 6  •  3 WEEKS", C.phase4));
children.push(spacer());

children.push(p(
  "Goal: ship to all PortaSwitch customers. Self-care integration was decided in W0 (W0-01) so this phase implements that decision rather than discovering it. Telemetry, docs, support training, rollback drill, and the launch itself."
));

children.push(h3("Exit criteria"));
children.push(bullet("Call Flow Studio appears in self-care per the W0-01 ADR (shared SPA / iframe / module federation / standalone)."));
children.push(bullet("Legacy screens remain available; customers see an \"Open in Call Flow Studio\" entry point on every applicable entity."));
children.push(bullet("Telemetry: entity opened, entity saved, simulator run, template applied, JSON imported/exported, validation error encountered — all PII-redacted per W0-07."));
children.push(bullet("Public docs page published; support runbook published internally; support team trained."));
children.push(bullet("Rollback drill rehearsed in staging."));
children.push(bullet("Feature flag flipped progressively: 10% → 50% → 100% over the launch week."));

children.push(h3("Tasks"));
const p6Rows = [
  ["P6-01", "Self-care integration", "Implement the W0-01 ADR. Auth shared from the host. Navigation entry point. \"Open in Call Flow Studio\" entry on extension / AA / HG list views in legacy.", "L"],
  ["P6-02", "Telemetry events", "Wire defined events into the platform analytics pipeline. PII redaction verified (same allow-list as Sentry, per W0-07). Dashboard for PRD §16.2 success metrics.", "M"],
  ["P6-03", "User documentation", "Docs writer leads (not engineer). Pages: getting started, building a flow, simulator, templates, JSON schema reference, FAQ. Embedded short videos.", "M"],
  ["P6-04", "Support runbook", "Internal. How to diagnose common issues, what each validation rule means, how to read the JSON, how to restore from history. Includes contact paths for backend.", "S"],
  ["P6-05", "Support team training session", "90-minute walkthrough, recorded, with Q&A. Repeated for the second time-zone if needed.", "S"],
  ["P6-06", "Rollback drill in staging", "Rehearse: flip the flag off, verify legacy continues to work, verify customer state is intact. Document the exact steps and time-to-rollback.", "S"],
  ["P6-07", "Launch communications", "Customer-facing announcement positioning Call Flow Studio as a new option, not a replacement. Internal go/no-go meeting on the morning of launch.", "S"],
  ["P6-08", "Launch checklist", "Pre-launch: perf, a11y, telemetry firing, error rate baseline, support trained, rollback drilled. Ten-item checklist, signed off by eng lead + PM + support lead.", "S"],
  ["P6-09", "Progressive flag rollout", "10% of customers on day 1; 50% on day 3 if metrics hold; 100% on day 5. Monitor error rates and adoption hourly during ramp.", "S"],
  ["P6-10", "On-call rotation post-GA", "Eng team rotation defined. Pager-duty wired to Sentry alerts above a threshold. First week of GA has the team on standby.", "S"],
];
children.push(buildTable(["T-ID", "Task", "Detail", "Size"], p6Rows, [800, 2400, 5260, 900]));

children.push(spacer());
children.push(p("Eng-day total: ~22 days. Wall time at 2.0× across two engineers ≈ 2.2 weeks. Plus PM and docs effort. 3 calendar weeks accommodates support training cycles and the staged rollout."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// CROSS-PHASE
children.push(h1("11. Cross-phase concerns"));

children.push(h2("11.1 Team"));
const teamRows = [
  ["Engineering lead", "Architecture owner, PR reviewer, unblocker. Realistic time-on-code: ~30%, not 50%.", "Full-time"],
  ["Senior frontend × 2", "Primary builders. Pair on hardest items (P2-14 screening rule, P4-01 simulator, W0-01 integration).", "Full-time"],
  ["Designer", "Canvas / inspector / palette system. Owns the inspector-pattern ADR. Weekly design reviews from P1 onwards.", "70%"],
  ["Product manager", "PRD owner. Runs reseller beta. Drives open-question resolutions. Owns launch comms.", "40%"],
  ["QA engineer", "Owns simulator-fidelity validation (P4-08). Maintains synthetic test flows and Playwright suite.", "50% from P2 onwards"],
  ["Backend liaison", "Named PortaSwitch backend engineer with calendar time blocked for joint reviews.", "≥10% through end of P3"],
  ["Docs writer", "Owns P6-03 user documentation.", "P5-end onwards, 50%"],
];
children.push(buildTable(["Role", "Responsibility", "Allocation"], teamRows, [2200, 5260, 1900]));

children.push(h2("11.2 Risks (tracked across phases)"));
const riskRows = [
  ["Self-care integration approach proves wrong", "W0-01 picks an option; later we discover it can't deliver the UX or auth integration we need.", "Spike P6-01 minimally in W0 — implement a hello-world version inline with the ADR.", "Eng lead"],
  ["API shape drift", "PortaSwitch APIs change under us before GA.", "Joint reviews at end of W0, P1, P2, P3. Adapter layer absorbs drift.", "Backend liaison"],
  ["Simulator divergence", "Simulator says one thing, real platform does another.", "P4-08 gate: validate against ≥20 real flows. Treat discrepancies as simulator bugs.", "QA"],
  ["Design churn on inspector", "Re-doing every node's inspector form costs days each.", "Lock inspector pattern by end of P1 (P1-02 ADR). Subsequent phases reuse, do not redesign.", "Designer"],
  ["Perf regressions creep in", "By the time a customer notices, the regression is months old.", "Perf harness in CI from P5-01; thresholds fail PRs.", "Eng lead"],
  ["Scope creep from reseller beta", "Partners ask for everything.", "Triage rule: in-scope ships in P5; everything else is post-GA backlog.", "PM"],
  ["Schema breaking changes too late", "We freeze before knowing enough, or after committing to bad shapes.", "Schema is provisional (0.x) through P3; v1.0 freeze at P4-15 gates the release. Two-major import compat documented.", "Eng lead"],
  ["Browser fragmentation in customer base", "\"Latest 2 versions\" excludes a meaningful customer fraction.", "Verify customer browser distribution in W0. Adjust target if needed.", "PM"],
  ["Telemetry PII leak", "Flow contents contain phone numbers, emails, DIDs.", "Allow-list redaction in Sentry and analytics SDKs (W0-07). Reviewed in P5-12 security review.", "Eng lead"],
  ["On-call coverage thin at launch", "Two-person team can't cover 24/7.", "P6-10 defines rotation. First week of GA has the team on standby, not solo.", "Eng lead"],
];
children.push(buildTable(["Risk", "What it looks like", "Mitigation", "Owner"], riskRows, [2000, 2400, 3300, 1660]));

children.push(h2("11.3 Definition of Done — every task"));
children.push(bullet("Code merged to main via PR with at least one approval."));
children.push(bullet("Vitest unit coverage on new logic; Playwright coverage on new user-visible flows."));
children.push(bullet("TypeScript strict-mode clean. No new ESLint warnings."));
children.push(bullet("Accessibility: tab order works, focus visible, axe-core passes on touched UI."));
children.push(bullet("Documentation updated in the same PR — README, ADR, or user docs as appropriate."));
children.push(bullet("Staging deploy succeeded; manual smoke test by the author."));
children.push(bullet("No new Sentry errors above baseline in staging within 24h."));
children.push(bullet("If user-visible: short demo recording attached to the PR."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// TIMELINE
children.push(h1("12. Timeline summary"));

children.push(p("28 calendar weeks. One row per week. The shading indicates the dominant phase."));

const timelineRows = [
  ["W1",  "W0", "Setup: repo, CI, ADRs, design tokens, integration decision"],
  ["W2",  "P1", "Schemas + store + inspector ADR"],
  ["W3",  "P1", "First custom nodes + JSON import/export"],
  ["W4",  "P1", "Round-trip property tests + empty states"],
  ["W5",  "P1", "Phase 1 demo + sign-off"],
  ["W6",  "P2", "Shared components (rule-row, pickers)"],
  ["W7",  "P2", "Forwarding nodes (all 4 types)"],
  ["W8",  "P2", "Voicemail + recording + outgoing"],
  ["W9",  "P2", "Screening rule node"],
  ["W10", "P2", "Validation engine + Issues panel"],
  ["W11", "P2", "API integration + Phase 2 demo"],
  ["W12", "P3", "AA schema + ROOT/custom menus"],
  ["W13", "P3", "Action types (11 total)"],
  ["W14", "P3", "Dial-by-name + voicemail + fax mailbox"],
  ["W15", "P3", "Hunt groups"],
  ["W16", "P3", "Cross-entity import + AA API"],
  ["W17", "P3", "Validation + Phase 3 demo"],
  ["W18", "P4", "Simulator engine — extensions"],
  ["W19", "P4", "Simulator engine — AA + hunt groups"],
  ["W20", "P4", "Simulator UI + scenarios + templates"],
  ["W21", "P4", "Fidelity validation + schema 1.0 freeze"],
  ["W22", "P5", "Perf harness + perf pass"],
  ["W23", "P5", "Accessibility + version history + audit log"],
  ["W24", "P5", "i18n + empty/error states"],
  ["W25", "P5", "Security review + reseller beta + sign-off"],
  ["W26", "P6", "Self-care integration + telemetry"],
  ["W27", "P6", "Docs + support training + rollback drill"],
  ["W28", "P6", "Progressive rollout 10% → 50% → 100%"],
];
children.push(buildTable(["Week", "Phase", "Headline work"], timelineRows, [900, 900, 7560]));

children.push(spacer());
children.push(callout(
  "Why 28 weeks, not 22",
  [
    "v1 used a 1.5× wall-time multiplier and underestimated API integration. v2 corrects both: 2.0× multiplier, doubled API estimates (P2-21/22, P3-22), Phase 0 expanded to a real Week 0, and missing tasks added throughout (feature flags, error boundaries, copy/paste, empty states, security review, on-call, rollback drill, support training).",
    "If 22 weeks is required, apply the compression options in §3: drop reseller templates, English-only at GA, combine P5 + P6. Each option has a v1.1 follow-up.",
  ]
));

// HEADER/FOOTER
const header = new Header({
  children: [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 6 } },
      children: [
        new TextRun({ text: "Call Flow Studio — Implementation plan v2", font: "Arial", size: 18, color: C.muted, bold: true }),
        new TextRun({ text: "\tInternal  •  v2.0", font: "Arial", size: 18, color: C.muted }),
      ],
    }),
  ],
});
const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Page ", font: "Arial", size: 18, color: C.muted }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: C.muted }),
        new TextRun({ text: " of ", font: "Arial", size: 18, color: C.muted }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: C.muted }),
      ],
    }),
  ],
});

const doc = new Document({
  creator: "Call Flow Studio team",
  title: "Implementation plan v2",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: C.primary },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: C.primary },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: C.accent },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
        ] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
      },
    },
    headers: { default: header },
    footers: { default: footer },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/claude/prd/Call_Flow_Studio_Implementation_Plan_v2.docx", buffer);
  console.log("OK", buffer.length, "bytes");
});
