import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type OnConnectStartParams,
  type ReactFlowInstance,
} from "reactflow";
import {
  ArrowUpRight,
  Copy,
  LayoutGrid,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useFlowStore } from "@/state/store";
import { reactFlowNodeTypes } from "@/nodes/nodeTypes";
import { layoutDagre } from "./autoLayout";
import { getNodeType, type NodeTypeDef } from "@/nodes/registry";
import type { FlowNode, NodeKind } from "@/schema";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";
import { styleEdges } from "./edgeStyle";
import { useUiStore } from "@/state/uiStore";
import { MenuKeyPicker } from "./MenuKeyPicker";
import "./Canvas.css";

const ICON_SIZE = 14;

export const PALETTE_DRAG_MIME = "application/x-callflow-node-kind";

const HINT_KEY = "cfs.canvas.hints.v1";

type HintFlag = "contextMenu" | "dragDrop" | "zoom";

function readHintFlags(): Record<HintFlag, boolean> {
  if (typeof window === "undefined") {
    return { contextMenu: false, dragDrop: false, zoom: false };
  }
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      contextMenu: !!parsed?.contextMenu,
      dragDrop: !!parsed?.dragDrop,
      zoom: !!parsed?.zoom,
    };
  } catch {
    return { contextMenu: false, dragDrop: false, zoom: false };
  }
}

export function Canvas() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const addNode = useFlowStore((s) => s.addNode);
  const addNodeConnectedTo = useFlowStore((s) => s.addNodeConnectedTo);
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
  const miniMapCollapsed = useUiStore((s) => s.miniMapCollapsed);
  const setMiniMapCollapsed = useUiStore((s) => s.setMiniMapCollapsed);
  const setDropTargetNodeId = useUiStore((s) => s.setDropTargetNodeId);
  const setPendingMenuPick = useUiStore((s) => s.setPendingMenuPick);
  const setConnectingFromNodeId = useUiStore((s) => s.setConnectingFromNodeId);

  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [hintFlags, setHintFlags] = useState(() => readHintFlags());

  const markHint = useCallback((flag: HintFlag) => {
    setHintFlags((prev) => {
      if (prev[flag]) return prev;
      const next = { ...prev, [flag]: true };
      try {
        window.localStorage.setItem(HINT_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const allHintsSeen = hintFlags.contextMenu && hintFlags.dragDrop && hintFlags.zoom;

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

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rf = instanceRef.current;
      if (!rf) return;
      const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // 1x1 probe — getIntersectingNodes returns hits in render order.
      const hits = rf.getIntersectingNodes({
        x: flowPos.x,
        y: flowPos.y,
        width: 1,
        height: 1,
      });
      // Top-most (rendered last) wins.
      const top = hits.length ? hits[hits.length - 1] : null;
      setDropTargetNodeId(top?.id ?? null);
    },
    [setDropTargetNodeId],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Fires for child re-entries too; clear only when leaving the wrapper.
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(e.relatedTarget as Node | null)) {
        setDropTargetNodeId(null);
      }
    },
    [setDropTargetNodeId],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(PALETTE_DRAG_MIME) as NodeKind;
      const rf = instanceRef.current;
      if (!kind || !rf) {
        setDropTargetNodeId(null);
        return;
      }
      const def: NodeTypeDef | undefined = getNodeType(kind);
      if (!def) {
        setDropTargetNodeId(null);
        return;
      }
      const targetId = useUiStore.getState().dropTargetNodeId;
      setDropTargetNodeId(null);
      markHint("dragDrop");

      if (!targetId) {
        const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNode(kind, position);
        return;
      }

      const targetNode = useFlowStore
        .getState()
        .nodes.find((n) => n.id === targetId);
      if (!targetNode) {
        const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNode(kind, position);
        return;
      }

      const result = addNodeConnectedTo(kind, targetId, null);
      const isMenuSource =
        targetNode.type === "menu_root" || targetNode.type === "menu_custom";
      const dragKindHasInput = def.inputs.length > 0;
      // Menu source + dragged kind accepts inputs → prompt for which key.
      // The store has already placed the node; we just need the user to pick a key.
      if (isMenuSource && dragKindHasInput) {
        const screen = rf.flowToScreenPosition({
          x: targetNode.position.x,
          y: targetNode.position.y,
        });
        setPendingMenuPick({
          menuId: targetId,
          newNodeId: result.nodeId,
          // Anchor the picker just below the menu node header.
          screenX: screen.x,
          screenY: screen.y + 40,
        });
      }
    },
    [addNode, addNodeConnectedTo, markHint, setDropTargetNodeId, setPendingMenuPick],
  );

  // --- Flavour B: drag a node connector and release over a palette item.
  // React Flow v11 splits this across onConnectStart (gives us the source) and
  // onConnectEnd (gives us the DOM event but no source). We stash the source in
  // a ref between the two.
  const connectSourceRef = useRef<OnConnectStartParams | null>(null);

  const onConnectStart = useCallback(
    (_e: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      connectSourceRef.current = params;
      setConnectingFromNodeId(params.nodeId);
    },
    [setConnectingFromNodeId],
  );

  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const source = connectSourceRef.current;
      connectSourceRef.current = null;
      setConnectingFromNodeId(null);
      if (!source || !source.nodeId) return;
      // Only act when the user released on a palette item. If they released on
      // a real handle, React Flow has already fired onConnect; if they released
      // on empty canvas, do nothing (today's behaviour).
      const target = e.target as HTMLElement | null;
      const paletteEl = target?.closest("[data-palette-kind]") as HTMLElement | null;
      if (!paletteEl) return;
      const kind = paletteEl.getAttribute("data-palette-kind") as NodeKind | null;
      if (!kind) return;
      const def = getNodeType(kind);
      if (!def) return;
      addNodeConnectedTo(kind, source.nodeId, source.handleId ?? null);
    },
    [addNodeConnectedTo, setConnectingFromNodeId],
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
      markHint("contextMenu");
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
    [duplicateNode, removeNode, setSelected, markHint],
  );

  const onEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault();
      markHint("contextMenu");
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: "Delete edge",
            icon: <Trash2 size={ICON_SIZE} />,
            danger: true,
            onClick: () => removeEdge(edge.id),
          },
        ],
      });
    },
    [removeEdge, markHint],
  );

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      markHint("contextMenu");
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
            icon: <LayoutGrid size={ICON_SIZE} />,
            onClick: handleAutoLayout,
            disabled: nodes.length === 0,
          },
          {
            label: "Fit to view",
            icon: <Maximize2 size={ICON_SIZE} />,
            onClick: handleFitView,
          },
          { divider: true, label: "" },
          {
            label: "Add Disconnect here",
            icon: <Plus size={ICON_SIZE} />,
            onClick: () => flowPos && addNode("action_disconnect", flowPos),
          },
          {
            label: "Add Voicemail here",
            icon: <Plus size={ICON_SIZE} />,
            onClick: () => flowPos && addNode("voicemail", flowPos),
          },
          {
            label: "Add Transfer here",
            icon: <Plus size={ICON_SIZE} />,
            onClick: () => flowPos && addNode("action_transfer", flowPos),
          },
          { divider: true, label: "" },
          {
            label: "Clear flow",
            icon: <Trash2 size={ICON_SIZE} />,
            danger: true,
            onClick: () => {
              if (window.confirm("Clear all nodes and edges?")) clearFlow();
            },
          },
        ],
      });
    },
    [nodes.length, addNode, clearFlow, handleAutoLayout, handleFitView, markHint],
  );

  return (
    <div
      className="canvas-wrapper"
      ref={wrapperRef}
      onWheel={(e) => {
        // Wheel + Ctrl (or just wheel inside React Flow) zooms; mark the hint
        // as seen on first such interaction.
        if (e.deltaY !== 0) markHint("zoom");
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onInit={onInit}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        // onSelectionChange covers both pure clicks (which fire onNodeClick) and
        // click-drags (which fire onNodeDragStart but never onNodeClick, because
        // RF reclassifies the gesture as a drag once the pointer moves past its
        // threshold). Driving selectedNodeId from this single source keeps the
        // Inspector in sync regardless of how the selection was set.
        onSelectionChange={({ nodes: selected }) =>
          setSelected(selected[0]?.id ?? null)
        }
        onPaneClick={() => {
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
        {miniMapCollapsed ? (
          <button
            type="button"
            className="canvas-minimap-toggle"
            onClick={() => setMiniMapCollapsed(false)}
            title="Show mini-map"
            aria-label="Show mini-map"
            aria-expanded={false}
          >
            <MapIcon size={16} aria-hidden />
          </button>
        ) : (
          <>
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(n) => {
                const def = getNodeType(n.type as NodeKind);
                return def?.color ?? "#6b7280";
              }}
              maskColor="rgba(15, 17, 21, 0.6)"
              style={{ background: "var(--bg-elev)" }}
            />
            <button
              type="button"
              className="canvas-minimap-collapse"
              onClick={() => setMiniMapCollapsed(true)}
              title="Hide mini-map"
              aria-label="Hide mini-map"
              aria-expanded={true}
            >
              <Minimize2 size={14} aria-hidden />
            </button>
          </>
        )}
        <div className="canvas-actions">
          <button type="button" onClick={handleAutoLayout} title="Auto-layout (dagre LR)">
            Auto-layout
          </button>
          <button type="button" onClick={handleFitView} title="Fit view">
            Fit
          </button>
        </div>
        {!allHintsSeen && (
          <div className="canvas-hint" role="status" aria-live="polite">
            <span className={hintFlags.contextMenu ? "is-done" : ""}>Right-click</span>
            {" · "}
            <span className={hintFlags.dragDrop ? "is-done" : ""}>drag from Palette</span>
            {" · "}
            <span className={hintFlags.zoom ? "is-done" : ""}>scroll to zoom</span>
          </div>
        )}
      </ReactFlow>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      <MenuKeyPicker />
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
    { label: `Type: ${def.label}`, disabled: true },
    { divider: true, label: "" },
    ...(targetId
      ? [
          {
            label: `Go to target (${targetId})`,
            icon: <ArrowUpRight size={ICON_SIZE} />,
            onClick: () => ops.goToTarget(targetId),
          },
        ]
      : []),
    {
      label: "Duplicate",
      icon: <Copy size={ICON_SIZE} />,
      shortcut: "Ctrl+D",
      onClick: ops.duplicate,
      disabled: def.singletonPerEntity,
    },
    {
      label: "Delete",
      icon: <Trash2 size={ICON_SIZE} />,
      shortcut: "Del",
      onClick: ops.remove,
      disabled: def.singletonPerEntity,
      danger: true,
    },
  ];
}
