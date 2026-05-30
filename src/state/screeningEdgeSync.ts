import type { Edge, Node } from "reactflow";
import type { FlowNode } from "@/schema";

const RULE_HANDLE_PREFIX = "rule:";

function isScreeningNode(node: { type?: string }): boolean {
  return node.type === "call_screening";
}

export function screeningRuleEdgeId(sourceId: string, ruleId: string): string {
  return `screening_${sourceId}_rule_${ruleId}`;
}

export function screeningFallbackEdgeId(sourceId: string): string {
  return `screening_${sourceId}_fallback`;
}

/**
 * Project a call screening node's rules and fallback into canvas edges.
 */
export function projectScreeningEdges(
  screeningNode: Node<FlowNode["data"]>,
  existingEdges: Edge[],
): Edge[] {
  if (!isScreeningNode(screeningNode)) return existingEdges;
  const data = screeningNode.data as any;
  const rules = (data.rules as Array<any>) ?? [];
  const fallbackNodeId = data.fallback_node_id as string | undefined;

  // Filter out any existing screening rule or fallback edges for this source node
  const filtered = existingEdges.filter(
    (e) =>
      !(
        e.source === screeningNode.id &&
        ((e.sourceHandle ?? "").startsWith(RULE_HANDLE_PREFIX) || e.sourceHandle === "fallback")
      ),
  );

  const next: Edge[] = [...filtered];

  // Add rule edges
  for (const r of rules) {
    if (!r.id || !r.target_node_id) continue;
    next.push({
      id: screeningRuleEdgeId(screeningNode.id, r.id),
      source: screeningNode.id,
      sourceHandle: `${RULE_HANDLE_PREFIX}${r.id}`,
      target: r.target_node_id,
      targetHandle: "in",
      label: r.name || "Rule",
    });
  }

  // Add fallback edge
  if (fallbackNodeId) {
    next.push({
      id: screeningFallbackEdgeId(screeningNode.id),
      source: screeningNode.id,
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
export function applyScreeningConnectToRules(
  nodes: Node<FlowNode["data"]>[],
  conn: { source: string; sourceHandle?: string | null; target: string },
): Node<FlowNode["data"]>[] {
  const sh = conn.sourceHandle ?? "";
  if (sh === "fallback") {
    return nodes.map((n) => {
      if (n.id !== conn.source || !isScreeningNode(n)) return n;
      return {
        ...n,
        data: { ...n.data, fallback_node_id: conn.target } as typeof n.data,
      };
    });
  }

  if (!sh.startsWith(RULE_HANDLE_PREFIX)) return nodes;
  const ruleId = sh.slice(RULE_HANDLE_PREFIX.length);

  return nodes.map((n) => {
    if (n.id !== conn.source || !isScreeningNode(n)) return n;
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
export function applyScreeningEdgeRemovalToRules(
  nodes: Node<FlowNode["data"]>[],
  removed: Edge,
): Node<FlowNode["data"]>[] {
  const sh = removed.sourceHandle ?? "";
  if (sh === "fallback") {
    return nodes.map((n) => {
      if (n.id !== removed.source || !isScreeningNode(n)) return n;
      const nextData = { ...n.data };
      delete (nextData as any).fallback_node_id;
      return {
        ...n,
        data: nextData as typeof n.data,
      };
    });
  }

  if (!sh.startsWith(RULE_HANDLE_PREFIX)) return nodes;
  const ruleId = sh.slice(RULE_HANDLE_PREFIX.length);

  return nodes.map((n) => {
    if (n.id !== removed.source || !isScreeningNode(n)) return n;
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
