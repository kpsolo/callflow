import { useEffect, useState } from "react";
import { useCollab, type ActivityEvent, type ActivityKind } from "@/api";
import { useFlowStore } from "@/state/store";
import "./ActivityLogModal.css";

const KIND_LABEL: Record<ActivityKind, string> = {
  flow_loaded: "loaded flow",
  flow_exported: "exported flow",
  flow_imported: "imported flow",
  flow_cleared: "cleared flow",
  node_added: "added a node",
  node_removed: "removed a node",
  node_duplicated: "duplicated a node",
  node_renamed: "renamed a node",
  node_data_changed: "edited a node",
  edge_added: "added an edge",
  edge_removed: "removed an edge",
  menu_action_retargeted: "retargeted a menu action",
  forwarding_rule_changed: "changed a forwarding rule",
  time_period_changed: "changed a time period",
  entity_renamed: "renamed the entity",
  lock_acquired: "acquired the edit lock",
  lock_released: "released the edit lock",
  lock_taken_over: "took over the edit lock",
  comment_added: "left a comment",
  comment_resolved: "resolved a comment",
  comment_deleted: "deleted a comment",
};

function formatPayload(kind: ActivityKind, payload?: Record<string, unknown>): string {
  if (!payload) return "";
  switch (kind) {
    case "node_added":
    case "node_removed":
    case "node_duplicated":
    case "node_data_changed":
      return (payload.nodeId as string) ?? "";
    case "node_renamed":
      return `${payload.from} → ${payload.to}`;
    case "edge_added":
    case "edge_removed":
      return (payload.edgeId as string) ?? "";
    case "menu_action_retargeted":
      return `${payload.edgeId}: ${payload.from} → ${payload.to}`;
    case "entity_renamed":
      return `${payload.from} → ${payload.to}`;
    case "comment_added":
    case "comment_resolved":
    case "comment_deleted":
      return (payload.commentId as string)?.slice(0, 8) ?? "";
    default:
      return "";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}

export function ActivityLogModal({ onClose }: { onClose: () => void }) {
  const collab = useCollab();
  const flowId = useFlowStore((s) => s.entity.id);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    return collab.observeActivity(flowId, setEvents);
  }, [collab, flowId]);

  // Newest first.
  const reversed = [...events].reverse();

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Activity log">
      <div className="modal alm">
        <header>
          <strong>Activity log — {flowId}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          {reversed.length === 0 ? (
            <p className="shell-placeholder">No activity recorded for this flow yet.</p>
          ) : (
            <ul className="activity-list">
              {reversed.map((e) => (
                <li key={e.id}>
                  <div className="activity-meta">
                    <strong>{e.actorDisplayName}</strong>
                    <small title={e.at}>{relativeTime(e.at)}</small>
                  </div>
                  <div className="activity-body">
                    <span className={`activity-kind kind-${e.kind}`}>
                      {KIND_LABEL[e.kind] ?? e.kind}
                    </span>
                    <code className="activity-detail">{formatPayload(e.kind, e.payload)}</code>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer>
          <small>
            Activity is persisted in <code>localStorage</code> (last 200 events).
          </small>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
