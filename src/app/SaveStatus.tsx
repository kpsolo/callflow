import { useEffect, useState } from "react";
import { useFlowStore } from "@/state/store";
import "./SaveStatus.css";

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function SaveStatus() {
  const dirty = useFlowStore((s) => s.dirty);
  const lastSavedAt = useFlowStore((s) => s.lastSavedAt);

  // Re-render every 10s so the "Xs ago" text stays current without spinning the
  // store on each tick.
  const [, force] = useState(0);
  useEffect(() => {
    if (dirty || !lastSavedAt) return;
    const t = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [dirty, lastSavedAt]);

  if (dirty) {
    return (
      <span className="save-status is-dirty" title="Export the flow to save your changes.">
        <span className="save-status-dot" /> Unsaved
      </span>
    );
  }
  if (!lastSavedAt) {
    return <span className="save-status">—</span>;
  }
  return (
    <span className="save-status" title="Time since last load or export.">
      <span className="save-status-dot is-ok" /> Saved {formatAgo(Date.now() - lastSavedAt)}
    </span>
  );
}
