import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { useFlowStore } from "@/state/store";
import { persistFlow } from "./useAutosave";
import "./SaveButton.css";

/**
 * Save affordance. Mocks a server save by writing to localStorage and
 * adding a ~400ms fake-latency window so the UI transitions read like a
 * real round-trip. When the backend lands, replace `persistFlow()` with an
 * API call — every other state transition stays the same.
 *
 * States:
 *   • dirty + idle      — "Save" (filled accent button)
 *   • clean + idle      — "Saved" with check (subdued; still clickable to
 *                         force-resend, like Google Docs' file menu does)
 *   • saving            — "Saving…" with spinner, disabled
 */

const FAKE_LATENCY_MS = 400;

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function SaveButton() {
  const dirty = useFlowStore((s) => s.dirty);
  const lastSavedAt = useFlowStore((s) => s.lastSavedAt);
  const markSaved = useFlowStore((s) => s.markSaved);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    // Mock: write to localStorage during the fake-latency window, then flip
    // the store-level saved state. Swap persistFlow() for an API call once
    // the backend is wired up.
    setTimeout(() => {
      persistFlow();
      markSaved();
      setSaving(false);
    }, FAKE_LATENCY_MS);
  };

  if (saving) {
    return (
      <button
        type="button"
        className="save-btn save-btn--saving"
        disabled
        aria-busy
      >
        <Loader2 size={14} className="save-btn-spinner" aria-hidden />
        <span>Saving…</span>
      </button>
    );
  }

  if (dirty) {
    return (
      <button
        type="button"
        className="save-btn save-btn--dirty"
        onClick={handleSave}
        title="Send your changes to the server"
      >
        <Save size={14} aria-hidden />
        <span>Save</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="save-btn save-btn--clean"
      onClick={handleSave}
      title={lastSavedAt ? `Last saved ${formatAgo(Date.now() - lastSavedAt)}` : "No changes"}
    >
      <Check size={14} aria-hidden />
      <span>Saved</span>
    </button>
  );
}
