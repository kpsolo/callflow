import { useEffect, useState } from "react";
import { X, RotateCcw, Bookmark } from "lucide-react";
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
  manual_checkpoint: "created checkpoint",
  version_restored: "restored a past version",
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
    case "manual_checkpoint":
    case "version_restored":
      return (payload.description as string) ?? "";
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
  const [checkpointDesc, setCheckpointDesc] = useState("");

  useEffect(() => {
    return collab.observeActivity(flowId, setEvents);
  }, [collab, flowId]);

  // Newest first.
  const reversed = [...events].reverse();

  const handleCreateCheckpoint = () => {
    const desc = checkpointDesc.trim();
    if (!desc) return;
    collab.recordActivity({
      flowId,
      kind: "manual_checkpoint",
      payload: { description: desc },
    });
    setCheckpointDesc("");
  };

  const handleRestore = (e: ActivityEvent) => {
    const snapshot = e.payload?.snapshot;
    if (!snapshot) return;

    const actionText = `${KIND_LABEL[e.kind] ?? e.kind}${
      formatPayload(e.kind, e.payload) ? ` (${formatPayload(e.kind, e.payload)})` : ""
    }`;
    const confirmRestore = window.confirm(
      `Are you sure you want to restore the flow to this point?\n\n` +
        `Point: ${actionText}\n` +
        `Saved by: ${e.actorDisplayName} (${relativeTime(e.at)})\n\n` +
        `Any current unsaved changes will be lost.`
    );
    if (!confirmRestore) return;

    // Restore flow state
    useFlowStore.getState().loadFlow(snapshot as any);

    // Record the restore activity event so it's logged in history
    collab.recordActivity({
      flowId,
      kind: "version_restored",
      payload: {
        description: `Restored to state from ${relativeTime(e.at)} (${e.actorDisplayName})`,
      },
    });

    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Version history & change log">
      <div className="modal alm">
        <header>
          <strong>Version History & Change Log — {flowId}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>
        <div className="modal-body">
          {/* Manual checkpoint creation bar */}
          <div className="activity-checkpoint-bar">
            <input
              type="text"
              placeholder="Enter version description or checkpoint label..."
              value={checkpointDesc}
              onChange={(e) => setCheckpointDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCheckpoint();
              }}
            />
            <button
              type="button"
              className="checkpoint-btn"
              disabled={!checkpointDesc.trim()}
              onClick={handleCreateCheckpoint}
            >
              <Bookmark size={14} style={{ marginRight: 4 }} />
              Create Checkpoint
            </button>
          </div>

          {reversed.length === 0 ? (
            <p className="shell-placeholder">No activity recorded for this flow yet.</p>
          ) : (
            <ul className="activity-list">
              {reversed.map((e) => {
                const isManual = e.kind === "manual_checkpoint";
                const isRestore = e.kind === "version_restored";
                const hasSnapshot = !!e.payload?.snapshot;

                return (
                  <li
                    key={e.id}
                    className={`activity-item ${isManual ? "is-checkpoint" : ""} ${
                      isRestore ? "is-restore" : ""
                    }`}
                  >
                    <div className="activity-item-header">
                      <div className="activity-meta">
                        <strong>{e.actorDisplayName}</strong>
                        <small title={e.at}>{relativeTime(e.at)}</small>
                        {isManual && <span className="checkpoint-badge">Manual Version</span>}
                        {isRestore && <span className="restore-badge">Restored</span>}
                      </div>
                      {hasSnapshot && (
                        <button
                          type="button"
                          className="activity-restore-btn"
                          onClick={() => handleRestore(e)}
                          title="Restore the call flow to this state"
                        >
                          <RotateCcw size={12} style={{ marginRight: 4 }} />
                          Restore
                        </button>
                      )}
                    </div>
                    <div className="activity-body">
                      <span className={`activity-kind kind-${e.kind}`}>
                        {KIND_LABEL[e.kind] ?? e.kind}
                      </span>
                      {formatPayload(e.kind, e.payload) && (
                        <code className="activity-detail">{formatPayload(e.kind, e.payload)}</code>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer>
          <small>
            Version history is automatically capped at a rolling buffer of <strong>100 actions</strong>.
          </small>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
