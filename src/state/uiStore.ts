import { create } from "zustand";
import type { NodeKind } from "@/schema";

/**
 * Ephemeral UI state shared across panes — used for cross-pane affordances
 * like "hovering a menu row should highlight the matching outgoing edge".
 *
 * Kept separate from `useFlowStore` because:
 *  - none of this belongs in undo/redo history,
 *  - it's purely transient (cleared on mouse-leave),
 *  - touching it shouldn't trigger Flow re-saves or autosave dirty-flags.
 */
interface UiState {
  /** The menu-action input key (e.g. "1", "fax", "no_input") under the cursor in the inspector. */
  hoveredMenuKey: string | null;
  setHoveredMenuKey: (key: string | null) => void;

  /** Used by the reverse direction: edge hover flashes the inspector row. */
  flashedMenuKey: string | null;
  flashMenuKey: (key: string | null) => void;

  /** Whether to surface raw node IDs in the inspector header. Off by default —
   *  IDs are author-facing internals, not part of the everyday editing flow. */
  showNodeIds: boolean;
  setShowNodeIds: (v: boolean) => void;

  /** Mini-map collapsed (icon-only) state. Collapsed by default — the mini-map
   *  occupies real-estate where nodes often sit, so we hide it behind a click
   *  until the user opts in. Persisted per-user via localStorage. */
  miniMapCollapsed: boolean;
  setMiniMapCollapsed: (v: boolean) => void;

  /** Node currently under a palette drag (HTML5 DnD). Drives a "drop-target"
   *  outline on that node so the user sees where a release will auto-connect. */
  dropTargetNodeId: string | null;
  setDropTargetNodeId: (id: string | null) => void;

  /** True while the user is dragging a connection out of a node's handle. The
   *  palette uses this to telegraph that releasing on a palette item creates
   *  a new connected node. Lives here (not in React Flow's store) because the
   *  palette renders outside the canvas's ReactFlowProvider. */
  connectingFromNodeId: string | null;
  setConnectingFromNodeId: (id: string | null) => void;

  /** When a palette item was dropped on a menu node, the picker pops up so the
   *  user can choose which menu key to bind the new node to. The new node has
   *  already been placed; only the edge waits on the pick. */
  pendingMenuPick: {
    menuId: string;
    newNodeId: string;
    screenX: number;
    screenY: number;
  } | null;
  setPendingMenuPick: (
    v: {
      menuId: string;
      newNodeId: string;
      screenX: number;
      screenY: number;
    } | null,
  ) => void;

  /** Most-recently-used node kinds (MRU at the front), capped at 5. Surfaced
   *  as a pinned section at the top of the palette so common kinds are one
   *  click away regardless of which category they live in. Persisted in
   *  localStorage. */
  recentNodeKinds: NodeKind[];
  recordRecentNodeKind: (kind: NodeKind) => void;

  /** Node rendering mode. v1 = compact summary rows, edit in the sidebar.
   *  v2 = main fields are editable inline inside each node card. */
  nodeVersion: "v1" | "v2";
  setNodeVersion: (v: "v1" | "v2") => void;
}

const RECENT_LIMIT = 5;

const SHOW_NODE_IDS_KEY = "callflow.ui.showNodeIds";
const MINIMAP_COLLAPSED_KEY = "callflow.ui.miniMapCollapsed";
const RECENT_NODE_KINDS_KEY = "callflow.ui.recentNodeKinds";
const NODE_VERSION_KEY = "callflow.ui.nodeVersion";

const readNodeVersion = (): "v1" | "v2" => {
  try {
    const raw = localStorage.getItem(NODE_VERSION_KEY);
    // Default to v2 (inline editing) — v1 is opt-in for users who prefer the
    // compact summary-card look with sidebar editing.
    return raw === "v1" ? "v1" : "v2";
  } catch {
    return "v2";
  }
};

const readShowNodeIds = (): boolean => {
  try {
    return localStorage.getItem(SHOW_NODE_IDS_KEY) === "1";
  } catch {
    return false;
  }
};

const readRecentNodeKinds = (): NodeKind[] => {
  try {
    const raw = localStorage.getItem(RECENT_NODE_KINDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is NodeKind => typeof x === "string").slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
};

const readMiniMapCollapsed = (): boolean => {
  try {
    // Default = collapsed when nothing's been stored.
    const raw = localStorage.getItem(MINIMAP_COLLAPSED_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
};

export const useUiStore = create<UiState>((set) => ({
  hoveredMenuKey: null,
  setHoveredMenuKey: (key) => set({ hoveredMenuKey: key }),
  flashedMenuKey: null,
  flashMenuKey: (key) => {
    set({ flashedMenuKey: key });
    if (key !== null) {
      // Auto-clear after a short flash window so the row briefly highlights and resets.
      setTimeout(() => {
        set((s) => (s.flashedMenuKey === key ? { flashedMenuKey: null } : s));
      }, 700);
    }
  },
  showNodeIds: readShowNodeIds(),
  setShowNodeIds: (v) => {
    try {
      localStorage.setItem(SHOW_NODE_IDS_KEY, v ? "1" : "0");
    } catch {
      // ignore — storage may be unavailable (private mode, embedded contexts)
    }
    set({ showNodeIds: v });
  },

  miniMapCollapsed: readMiniMapCollapsed(),
  setMiniMapCollapsed: (v) => {
    try {
      localStorage.setItem(MINIMAP_COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
    set({ miniMapCollapsed: v });
  },

  dropTargetNodeId: null,
  setDropTargetNodeId: (id) => set({ dropTargetNodeId: id }),

  connectingFromNodeId: null,
  setConnectingFromNodeId: (id) => set({ connectingFromNodeId: id }),

  pendingMenuPick: null,
  setPendingMenuPick: (v) => set({ pendingMenuPick: v }),

  recentNodeKinds: readRecentNodeKinds(),
  recordRecentNodeKind: (kind) =>
    set((s) => {
      const next = [kind, ...s.recentNodeKinds.filter((k) => k !== kind)].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(RECENT_NODE_KINDS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { recentNodeKinds: next };
    }),

  nodeVersion: readNodeVersion(),
  setNodeVersion: (v) => {
    try {
      localStorage.setItem(NODE_VERSION_KEY, v);
    } catch {
      // ignore
    }
    set({ nodeVersion: v });
  },
}));
