import { useEffect, useMemo, useState } from "react";
import { useCollab } from "./CollabProvider";
import type { Comment } from "./types";

/**
 * Subscribes to all comments for the given flow and returns:
 *  - the full list (sorted oldest first)
 *  - a derived map of unresolved counts per anchor key (`node:<id>`, `edge:<id>`, `flow`)
 *
 * Components that only need a per-node count can read straight from the map
 * to avoid re-rendering when comments on other anchors change.
 */
export function useFlowComments(flowId: string): {
  comments: Comment[];
  unresolvedByAnchor: Map<string, number>;
} {
  const collab = useCollab();
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    return collab.observeComments(flowId, setComments);
  }, [collab, flowId]);

  const unresolvedByAnchor = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.resolvedAt) continue;
      const key = anchorKey(c.anchor);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  return { comments, unresolvedByAnchor };
}

export function anchorKey(a: Comment["anchor"]): string {
  if (a.kind === "node") return `node:${a.nodeId}`;
  if (a.kind === "edge") return `edge:${a.edgeId}`;
  return "flow";
}
