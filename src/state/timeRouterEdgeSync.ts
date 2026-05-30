import type { Edge, Node } from "reactflow";
import type { FlowNode } from "@/schema";

const PERIOD_HANDLE_PREFIX = "period:";

function isTimeRouterNode(node: { type?: string }): boolean {
  return node.type === "time_router";
}

export function timeRouterRuleEdgeId(sourceId: string, ruleId: string): string {
  return `time_router_${sourceId}_rule_${ruleId}`;
}

export function timeRouterFallbackEdgeId(sourceId: string): string {
  return `time_router_${sourceId}_fallback`;
}

/**
 * Project a time router node's rules and fallback into canvas edges.
 */
export function projectTimeRouterEdges(
  timeRouterNode: Node<FlowNode["data"]>,
  existingEdges: Edge[],
): Edge[] {
  if (!isTimeRouterNode(timeRouterNode)) return existingEdges;
  const data = timeRouterNode.data as any;
  const rules = (data.rules as Array<any>) ?? [];
  const fallbackNodeId = data.fallback_node_id as string | undefined;

  // Filter out any existing time router rule or fallback edges for this source node
  const filtered = existingEdges.filter(
    (e) =>
      !(
        e.source === timeRouterNode.id &&
        ((e.sourceHandle ?? "").startsWith(PERIOD_HANDLE_PREFIX) || e.sourceHandle === "fallback")
      ),
  );

  const next: Edge[] = [...filtered];

  // Add rule edges
  for (const r of rules) {
    if (!r.id || !r.target_node_id) continue;
    next.push({
      id: timeRouterRuleEdgeId(timeRouterNode.id, r.id),
      source: timeRouterNode.id,
      sourceHandle: `${PERIOD_HANDLE_PREFIX}${r.id}`,
      target: r.target_node_id,
      targetHandle: "in",
      label: r.name || "Schedule",
    });
  }

  // Add fallback edge
  if (fallbackNodeId) {
    next.push({
      id: timeRouterFallbackEdgeId(timeRouterNode.id),
      source: timeRouterNode.id,
      sourceHandle: "fallback",
      target: fallbackNodeId,
      targetHandle: "in",
      label: "fallback",
    });
  }

  return next;
}

/**
 * Update the node rules or fallback node ID when a new canvas edge is connected.
 */
export function applyTimeRouterConnect(
  nodes: Node<FlowNode["data"]>[],
  conn: { source: string; sourceHandle?: string | null; target: string },
): Node<FlowNode["data"]>[] {
  const sh = conn.sourceHandle ?? "";
  if (sh === "fallback") {
    return nodes.map((n) => {
      if (n.id !== conn.source || !isTimeRouterNode(n)) return n;
      return {
        ...n,
        data: { ...n.data, fallback_node_id: conn.target } as typeof n.data,
      };
    });
  }

  if (!sh.startsWith(PERIOD_HANDLE_PREFIX)) return nodes;
  const ruleId = sh.slice(PERIOD_HANDLE_PREFIX.length);

  return nodes.map((n) => {
    if (n.id !== conn.source || !isTimeRouterNode(n)) return n;
    const data = n.data as any;
    const rules = (data.rules as Array<any> | undefined) ?? [];
    const nextRules = rules.map((r) => {
      if (r.id === ruleId) {
        return { ...r, target_node_id: conn.target };
      }
      return r;
    });
    return {
      ...n,
      data: { ...n.data, rules: nextRules } as typeof n.data,
    };
  });
}

/**
 * Remove connection references from rules or fallback when an edge is deleted.
 */
export function applyTimeRouterEdgeRemoval(
  nodes: Node<FlowNode["data"]>[],
  removed: Edge,
): Node<FlowNode["data"]>[] {
  const sh = removed.sourceHandle ?? "";
  if (sh === "fallback") {
    return nodes.map((n) => {
      if (n.id !== removed.source || !isTimeRouterNode(n)) return n;
      const nextData = { ...n.data };
      delete (nextData as any).fallback_node_id;
      return {
        ...n,
        data: nextData as typeof n.data,
      };
    });
  }

  if (!sh.startsWith(PERIOD_HANDLE_PREFIX)) return nodes;
  const ruleId = sh.slice(PERIOD_HANDLE_PREFIX.length);

  return nodes.map((n) => {
    if (n.id !== removed.source || !isTimeRouterNode(n)) return n;
    const data = n.data as any;
    const rules = (data.rules as Array<any> | undefined) ?? [];
    const nextRules = rules.map((r) => {
      if (r.id === ruleId) {
        const nextRule = { ...r };
        delete nextRule.target_node_id;
        return nextRule;
      }
      return r;
    });
    return {
      ...n,
      data: { ...n.data, rules: nextRules } as typeof n.data,
    };
  });
}
