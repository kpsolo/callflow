import { useEffect } from "react";
import { useFlowStore } from "@/state/store";

/**
 * Global keyboard shortcuts:
 * - Ctrl/Cmd+Z       undo
 * - Ctrl/Cmd+Shift+Z redo
 * - Delete/Backspace remove selected node (when canvas has focus)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useFlowStore.temporal.getState().redo();
        else useFlowStore.temporal.getState().undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "d" && !inEditable) {
        const id = useFlowStore.getState().selectedNodeId;
        if (id) {
          e.preventDefault();
          useFlowStore.getState().duplicateNode(id);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !inEditable) {
        const id = useFlowStore.getState().selectedNodeId;
        if (id) {
          e.preventDefault();
          useFlowStore.getState().removeNode(id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
