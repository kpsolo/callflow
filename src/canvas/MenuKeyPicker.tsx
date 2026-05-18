import { useEffect, useMemo, useRef } from "react";
import { useFlowStore } from "@/state/store";
import { useUiStore } from "@/state/uiStore";
import "./MenuKeyPicker.css";

const STANDARD_KEYS: string[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "#",
  "fax",
];

export function MenuKeyPicker() {
  const pending = useUiStore((s) => s.pendingMenuPick);
  const setPending = useUiStore((s) => s.setPendingMenuPick);
  const nodes = useFlowStore((s) => s.nodes);
  const onConnect = useFlowStore((s) => s.onConnect);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Esc dismisses without creating an edge.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, setPending]);

  // Click outside dismisses too.
  useEffect(() => {
    if (!pending) return;
    const onDown = (e: MouseEvent) => {
      const root = containerRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setPending(null);
    };
    // Defer registration to avoid the same click that just opened it dismissing it.
    const t = setTimeout(
      () => window.addEventListener("mousedown", onDown),
      0,
    );
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
    };
  }, [pending, setPending]);

  const freeKeys = useMemo(() => {
    if (!pending) return [];
    const menu = nodes.find((n) => n.id === pending.menuId);
    const actions =
      (menu?.data as { actions?: Record<string, unknown> } | undefined)
        ?.actions ?? {};
    return STANDARD_KEYS.filter((k) => !(k in actions));
  }, [pending, nodes]);

  if (!pending) return null;

  const choose = (key: string) => {
    onConnect({
      source: pending.menuId,
      sourceHandle: `menu:${key}`,
      target: pending.newNodeId,
      targetHandle: "in",
    });
    setPending(null);
  };

  return (
    <div
      ref={containerRef}
      className="menu-key-picker"
      style={{ left: pending.screenX, top: pending.screenY }}
      role="dialog"
      aria-label="Pick menu key"
    >
      <div className="menu-key-picker__title">Connect on key…</div>
      {freeKeys.length === 0 ? (
        <div className="menu-key-picker__empty">No free keys</div>
      ) : (
        <div className="menu-key-picker__grid">
          {freeKeys.map((k) => (
            <button
              key={k}
              type="button"
              className="menu-key-picker__chip"
              onClick={() => choose(k)}
            >
              {k}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="menu-key-picker__skip"
        onClick={() => setPending(null)}
      >
        Skip
      </button>
    </div>
  );
}
