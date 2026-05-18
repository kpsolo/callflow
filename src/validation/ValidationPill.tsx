import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useValidation } from "./useValidation";
import { IssuesPanel } from "./IssuesPanel";
import "./ValidationPill.css";

export function ValidationPill() {
  const issues = useValidation();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const err = issues.filter((i) => i.severity === "error").length;
  const warn = issues.filter((i) => i.severity === "warning").length;
  const clean = err === 0 && warn === 0;

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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={
          "vp" +
          (err > 0 ? " is-err" : "") +
          (err === 0 && warn > 0 ? " is-warn" : "") +
          (clean ? " is-ok" : "")
        }
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          clean
            ? "No validation issues"
            : `${err} error${err === 1 ? "" : "s"}, ${warn} warning${warn === 1 ? "" : "s"}`
        }
      >
        {clean ? (
          <>
            <Check size={12} aria-hidden /> Clean
          </>
        ) : (
          <>
            {err > 0 && <span className="vp-count">{err}</span>}
            {warn > 0 && err === 0 && <span className="vp-count">{warn}</span>}
            {err + warn} issue{err + warn === 1 ? "" : "s"}
          </>
        )}
      </button>
      {open && (
        <div className="vp-popover" ref={popRef} role="dialog" aria-label="Validation issues">
          <header>
            <strong>Validation</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} aria-hidden />
            </button>
          </header>
          <IssuesPanel />
        </div>
      )}
    </>
  );
}
