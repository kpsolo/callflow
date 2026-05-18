import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import { useFlowStore } from "@/state/store";
import { reactFlowNodeTypes } from "@/nodes/nodeTypes";
import { layoutDagre } from "./autoLayout";
import { getNodeType, type NodeTypeDef } from "@/nodes/registry";
import type { FlowNode, NodeKind } from "@/schema";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";
import { styleEdges } from "./edgeStyle";
import { useUiStore } from "@/state/uiStore";
import "./Canvas.css";

export const PALETTE_DRAG_MIME = "application/x-callflow-node-kind";

export function Canvas() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const addNode = useFlowStore((s) => s.addNode);
  const setSelected = useFlowStore((s) => s.setSelected);
  const replaceLayout = useFlowStore((s) => s.replaceLayout);
  const removeNode = useFlowStore((s) => s.removeNode);
  const duplicateNode = useFlowStore((s) => s.duplicateNode);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const clearFlow = useFlowStore((s) => s.clearFlow);
  const loadCounter = useFlowStore((s) => s.loadCounter);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const hoveredMenuKey = useUiStore((s) => s.hoveredMenuKey);
  const flashMenuKey = useUiStore((s) => s.flashMenuKey);

  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  // Apply the edge-style vocabulary (solid/dashed/dotted + per-digit colour)
  // before handing edges to React Flow. When the user hovers a menu-action row
  // in the inspector, the matching outgoing edge gets bumped to a thicker stroke
  // and brought above siblings.
  const styledEdges = useMemo(() => {
    const styled = styleEdges(edges);
    if (!hoveredMenuKey || !selectedNodeId) return styled;
    const wantedHandle = `menu:${hoveredMenuKey}`;
    return styled.map((e) => {
      const isHighlight = e.source === selectedNodeId && e.sourceHandle === wantedHandle;
      if (!isHighlight) return e;
      return {
        ...e,
        zIndex: 1000,
        style: {
          ...(e.style ?? {}),
          strokeWidth: 4,
          filter: "drop-shadow(0 0 4px var(--accent))",
        },
      };
    });
  }, [edges, hoveredMenuKey, selectedNodeId]);

  const onInit = useCallback((rf: ReactFlowInstance) => {
    instanceRef.current = rf;
  }, []);

  // Fit view when a fresh flow is loaded.
  useEffect(() => {
    if (loadCounter === 0) return;
    const t = setTimeout(() => instanceRef.current?.fitView({ padding: 0.15, duration: 250 }), 60);
    return () => clearTimeout(t);
  }, [loadCounter]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(PALETTE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(PALETTE_DRAG_MIME) as NodeKind;
      if (!kind || !instanceRef.current) return;
      const def: NodeTypeDef | undefined = getNodeType(kind);
      if (!def) return;
      const position = instanceRef.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNode(kind, position);
    },
    [addNode],
  );

  const handleAutoLayout = useCallback(() => {
    const positions = layoutDagre(nodes, edges, "LR");
    replaceLayout(positions);
    setTimeout(() => instanceRef.current?.fitView({ padding: 0.15, duration: 250 }), 50);
  }, [nodes, edges, replaceLayout]);

  const handleFitView = useCallback(() => {
    instanceRef.current?.fitView({ padding: 0.15, duration: 250 });
  }, []);

  // Right-click handlers — keep them stable across renders.
  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node<FlowNode["data"]>) => {
      e.preventDefault();
      setSelected(node.id);
      const def = getNodeType(node.type as NodeKind);
      const items = nodeMenuItems(node, def, {
        duplicate: () => duplicateNode(node.id),
        remove: () => removeNode(node.id),
        goToTarget: (id) => {
          setSelected(id);
          const target = useFlowStore.getState().nodes.find((n) => n.id === id);
          if (target && instanceRef.current) {
            instanceRef.current.setCenter(
              target.position.x + 80,
              target.position.y + 40,
              { duration: 250, zoom: instanceRef.current.getZoom() },
            );
          }
        },
      });
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    [duplicateNode, removeNode, setSelected],
  );

  const onEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault();
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: "Delete edge",
            icon: "✕",
            danger: true,
            onClick: () => removeEdge(edge.id),
          },
        ],
      });
    },
    [removeEdge],
  );

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      const mouseEvent = e as React.MouseEvent;
      const flowPos = instanceRef.current?.screenToFlowPosition({
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      });
      setMenu({
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        items: [
          {
            label: "Auto-layout",
            icon: "⊞",
            onClick: handleAutoLayout,
            disabled: nodes.length === 0,
          },
          { label: "Fit to view", icon: "⤧", onClick: handleFitView },
          { divider: true, label: "" },
          {
            label: "Add Disconnect here",
            icon: "+",
            onClick: () => flowPos && addNode("action_disconnect", flowPos),
          },
          {
            label: "Add Voicemail here",
            icon: "+",
            onClick: () => flowPos && addNode("voicemail", flowPos),
          },
          {
            label: "Add Transfer here",
            icon: "+",
            onClick: () => flowPos && addNode("action_transfer", flowPos),
          },
          { divider: true, label: "" },
          {
            label: "Clear flow",
            icon: "⌫",
            danger: true,
            onClick: () => {
              if (window.confirm("Clear all nodes and edges?")) clearFlow();
            },
          },
        ],
      });
    },
    [nodes.length, addNode, clearFlow, handleAutoLayout, handleFitView],
  );

  return (
    <div className="canvas-wrapper" ref={wrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={(_, n) => setSelected(n.id)}
        onPaneClick={() => {
          setSelected(null);
          setMenu(null);
        }}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeMouseEnter={(_, edge) => {
          // If the hovered edge is a menu action, flash the matching inspector row.
          const sh = edge.sourceHandle ?? "";
          if (sh.startsWith("menu:")) flashMenuKey(sh.slice("menu:".length));
        }}
        nodeTypes={reactFlowNodeTypes}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2f3a" />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable />
        <div className="canvas-actions">
          <button type="button" onClick={handleAutoLayout} title="Auto-layout (dagre LR)">
            Auto-layout
          </button>
          <button type="button" onClick={handleFitView} title="Fit view">
            Fit
          </button>
        </div>
        <div className="canvas-hint" role="status" aria-live="polite">
          Right-click for menu · drag from Palette · scroll to zoom
        </div>
      </ReactFlow>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function nodeMenuItems(
  node: Node<FlowNode["data"]>,
  def: NodeTypeDef,
  ops: {
    duplicate: () => void;
    remove: () => void;
    goToTarget: (id: string) => void;
  },
) {
  const data = node.data as Record<string, unknown>;
  const targetId =
    (data.target_node_id as string | undefined) ??
    (data.target_menu_node_id as string | undefined) ??
    (data.mailbox_node_id as string | undefined) ??
    (data.inactive_action_node_id as string | undefined);

  return [
    { label: `Type: ${def.label}`, icon: "·", disabled: true },
    { divider: true, label: "" },
    ...(targetId
      ? [
          {
            label: `Go to target (${targetId})`,
            icon: "↗",
            onClick: () => ops.goToTarget(targetId),
          },
        ]
      : []),
    {
      label: "Duplicate",
      icon: "⧉",
      shortcut: "Ctrl+D",
      onClick: ops.duplicate,
      disabled: def.singletonPerEntity,
    },
    {
      label: "Delete",
      icon: "✕",
      shortcut: "Del",
      onClick: ops.remove,
      disabled: def.singletonPerEntity,
      danger: true,
    },
  ];
}
