import { create } from "zustand";
import type { Trace } from "@/simulator/types";

interface TraceState {
  trace: Trace | null;
  visited_node_ids: Set<string>;
  setTrace: (t: Trace | null) => void;
}

export const useTraceStore = create<TraceState>((set) => ({
  trace: null,
  visited_node_ids: new Set(),
  setTrace: (t) => {
    const nodes = new Set<string>();
    if (t) for (const s of t.steps) if (s.node_id) nodes.add(s.node_id);
    set({ trace: t, visited_node_ids: nodes });
  },
}));
