import { useMemo } from "react";
import { useFlowStore } from "@/state/store";
import { validate, type Issue } from "./validate";

export function useValidation(): Issue[] {
  const exportFlow = useFlowStore((s) => s.exportFlow);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const entity = useFlowStore((s) => s.entity);
  return useMemo(() => {
    // Re-run when any of these change.
    void edges;
    void entity;
    return validate(exportFlow(), nodes);
  }, [exportFlow, nodes, edges, entity]);
}
