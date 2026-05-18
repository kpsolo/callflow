import { create } from "zustand";

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
}

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
}));
