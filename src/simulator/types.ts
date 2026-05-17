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
}

export interface TraceStep {
  node_id: string | null;
  node_type: string;
  message: string;
  elapsed_ms: number;
}

export interface SideEffect {
  kind: "recording_started" | "email_queued" | "fax_stored";
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
