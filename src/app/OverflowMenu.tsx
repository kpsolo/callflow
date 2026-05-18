import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import "./OverflowMenu.css";

export interface OverflowItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  icon?: ReactNode;
  /** When provided, the item is rendered as a toggle and shows a checkmark when true. */
  checked?: boolean;
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
        <MoreHorizontal size={16} aria-hidden />
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
                  role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                  aria-checked={it.checked !== undefined ? it.checked : undefined}
                  disabled={it.disabled}
                  onClick={() => {
                    it.onClick?.();
                    setOpen(false);
                  }}
                >
                  {it.checked !== undefined ? (
                    <span className="ovm-icon" aria-hidden="true">
                      {it.checked ? <Check size={14} /> : null}
                    </span>
                  ) : (
                    it.icon && <span className="ovm-icon">{it.icon}</span>
                  )}
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
