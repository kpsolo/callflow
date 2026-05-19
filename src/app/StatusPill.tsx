import { useEffect, useRef, useState } from "react";
import { useValidation } from "@/validation/useValidation";
import { IssuesPanel } from "@/validation/IssuesPanel";
import "./StatusPill.css";

/**
 * Validation issues pill. Renders only when there are errors or warnings —
 * a clean flow shows nothing. Click to open the IssuesPanel.
 *
 * Save state has its own affordance (see SaveButton); we deliberately do not
 * combine them anymore. A user with both unsaved changes AND validation
 * errors sees both signals side-by-side, which is what they need.
 */
export function StatusPill() {
  const issues = useValidation();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
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

  const errs = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warning").length;
  if (errs === 0 && warns === 0) return null;

  const tone = errs > 0 ? "err" : "warn";
  const text =
    errs > 0
      ? `${errs} error${errs === 1 ? "" : "s"}${warns > 0 ? `, ${warns} warning${warns === 1 ? "" : "s"}` : ""}`
      : `${warns} warning${warns === 1 ? "" : "s"}`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`sp sp--${tone}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Click to view validation issues"
      >
        <span className="sp-dot" />
        <span className="sp-text">{text}</span>
        <span className="sp-count">{errs + warns}</span>
      </button>
      {open && (
        <div className="sp-popover" ref={popRef} role="dialog" aria-label="Validation issues">
          <header>
            <strong>Validation</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>
          <IssuesPanel />
        </div>
      )}
    </>
  );
}
