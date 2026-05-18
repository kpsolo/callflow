import type { Flow, MenuInputKey } from "@/schema";

export type TerminalCode =
  | "answered"
  | "voicemail_left"
  | "forwarded_answered"
  | "forwarded_unanswered"
  | "rejected"
  | "disconnected"
  | "dropped";

export interface AnsweringBehaviorInput {
  target: string;
  outcome: "answer_after" | "never_answer" | "busy" | "network_fail";
  after_ms?: number;
}

export interface SimulatorInput {
  caller: string;
  callee: string;
  time: string;
  active_mode?: string;
  press_sequence?: MenuInputKey[];
  answering_behavior?: AnsweringBehaviorInput[];
  /** Names of time periods considered "active" at the given time. "always" is always active. */
  active_periods?: string[];
  /**
   * Optional on-demand recording action taken by the caller during the call.
   *
   *   "off"             — caller never pressed start/stop (default for on_demand mode)
   *   "started"         — caller pressed start (DTMF or Record button) and left it on
   *   "started_stopped" — caller started then stopped before hanging up
   *
   * Ignored when the matching `call_recording` node is in `automatic` mode.
   */
  manual_record?: "off" | "started" | "started_stopped";
}

export interface TraceStep {
  node_id: string | null;
  node_type: string;
  message: string;
  elapsed_ms: number;
}

export interface SideEffect {
  kind:
    | "recording_started"
    | "recording_stopped"
    | "transcription_queued"
    | "email_queued"
    | "fax_stored";
  detail: string;
  at_ms: number;
}

export interface Trace {
  steps: TraceStep[];
  terminal: TerminalCode;
  terminal_detail?: string;
  prompts: string[];
  side_effects: SideEffect[];
  visited_edge_ids: string[];
}

export interface SimulatorOptions {
  /** Maximum step count to guard against pathological loops. */
  step_limit?: number;
}

export type SimulateFn = (flow: Flow, input: SimulatorInput, opts?: SimulatorOptions) => Trace;
