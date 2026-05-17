import type { ComponentType } from "react";
import type { NodeProps } from "reactflow";
import { FlowNodeView } from "./FlowNodeView";
import { NODE_KINDS } from "@/schema";

// React Flow takes a map of `type` → component. Every kind uses the same generic view.
export const reactFlowNodeTypes: Record<string, ComponentType<NodeProps>> = Object.fromEntries(
  NODE_KINDS.map((kind) => [kind, FlowNodeView]),
);
