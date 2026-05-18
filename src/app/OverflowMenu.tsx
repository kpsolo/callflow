import { useEffect, useRef, useState } from "react";
import "./OverflowMenu.css";

export interface OverflowItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  icon?: string;
}

export function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onAway);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onAway);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="ovm" ref={ref}>
      <button
        type="button"
        className="ovm-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && (
        <ul className="ovm-list" role="menu">
          {items.map((it, i) =>
            it.divider ? (
              <li key={i} role="separator" className="ovm-divider" />
            ) : (
              <li key={i} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    it.onClick?.();
                    setOpen(false);
                  }}
                >
                  {it.icon && <span className="ovm-icon">{it.icon}</span>}
                  <span>{it.label}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
