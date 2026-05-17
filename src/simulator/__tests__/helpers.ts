import type { Flow, FlowNode } from "@/schema";
import { getNodeType } from "@/nodes/registry";
import type { NodeKind } from "@/schema";

let seq = 0;
function id(prefix: string) {
  seq += 1;
  return `${prefix}_${seq}`;
}

export function resetIds() {
  seq = 0;
}

export function mkNode<K extends NodeKind>(
  kind: K,
  patch: Partial<Extract<FlowNode, { type: K }>["data"]> = {},
  customId?: string,
): Extract<FlowNode, { type: K }> {
  const def = getNodeType(kind);
  const base = def.defaultData();
  return {
    id: customId ?? id(kind),
    type: kind,
    position: { x: 0, y: 0 },
    data: { ...base, ...patch },
  } as Extract<FlowNode, { type: K }>;
}

export function mkExtFlow(nodes: FlowNode[]): Flow {
  return {
    schema_version: "1.0",
    entity: {
      type: "extension",
      id: "ext_test",
      extension: "401",
      name: "Test Extension",
    },
    nodes,
    edges: [],
    scenarios: [],
  };
}

export function mkAaFlow(nodes: FlowNode[], directory: { extension: string; name: string; published?: boolean }[] = []): Flow {
  return {
    schema_version: "1.0",
    entity: {
      type: "auto_attendant",
      id: "aa_test",
      did: "+18005551234",
      name: "Test AA",
      directory: directory.map((d) => ({ extension: d.extension, name: d.name, published: d.published ?? true })),
    },
    nodes,
    edges: [],
    scenarios: [],
  };
}
