import { useEffect, useRef, type ReactNode } from "react";
import "./ContextMenu.css";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Render as a divider; `label` is ignored. */
  divider?: boolean;
  /** Subtle danger styling. */
  danger?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onAway);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onAway);
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  // Clamp to viewport so the menu doesn't render off-screen.
  const maxX = window.innerWidth - 220;
  const maxY = window.innerHeight - menu.items.length * 28 - 16;
  const left = Math.min(menu.x, maxX);
  const top = Math.min(menu.y, maxY);

  return (
    <ul
      className="ctxmenu"
      ref={ref}
      style={{ left, top }}
      role="menu"
      aria-label="Context menu"
    >
      {menu.items.map((it, i) =>
        it.divider ? (
          <li key={i} className="ctxmenu-divider" role="separator" />
        ) : (
          <li key={i} role="none">
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={"ctxmenu-item" + (it.danger ? " is-danger" : "")}
              onClick={() => {
                it.onClick?.();
                onClose();
              }}
            >
              <span className="ctxmenu-icon" aria-hidden>
                {it.icon ?? ""}
              </span>
              <span className="ctxmenu-label">{it.label}</span>
              {it.shortcut && <span className="ctxmenu-shortcut">{it.shortcut}</span>}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
