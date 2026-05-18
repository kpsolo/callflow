import { useEffect, useState } from "react";
import { useCollab, type PresenceEntry } from "@/api";
import { useFlowStore } from "@/state/store";
import "./PresenceStack.css";

const PALETTE = ["#4f8cff", "#06d6a0", "#ef476f", "#ffd166", "#9d4edd", "#bc6c25"];
function hashToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Stack of avatars for all OTHER users currently viewing the same flow.
 * Joins the presence channel on mount, leaves on unmount, and updates the
 * selection payload when the local user clicks a different node.
 */
export function PresenceStack() {
  const collab = useCollab();
  const flowId = useFlowStore((s) => s.entity.id);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const [others, setOthers] = useState<PresenceEntry[]>([]);

  // Subscribe + join for this flow.
  useEffect(() => {
    const offObs = collab.observePresence(flowId, setOthers);
    const offJoin = collab.joinPresence({ flowId });
    return () => {
      offObs();
      offJoin();
    };
  }, [collab, flowId]);

  // Push selection updates so other tabs can show "Alice viewing <node>".
  useEffect(() => {
    collab.updatePresence({ flowId, selectionNodeId: selectedNodeId ?? undefined });
  }, [collab, flowId, selectedNodeId]);

  // Deduplicate by user id (the same user across multiple tabs is one avatar).
  const seen = new Set<string>();
  const unique = others.filter((e) => {
    if (seen.has(e.user.id)) return false;
    seen.add(e.user.id);
    return true;
  });

  if (unique.length === 0) return null;

  return (
    <div className="presence-stack" role="list" aria-label="Other users viewing this flow">
      {unique.slice(0, 4).map((e) => (
        <span
          key={e.user.id}
          className="presence-stack-avatar"
          role="listitem"
          style={{ background: e.user.avatarUrl ?? hashToColor(e.user.displayName) }}
          title={`${e.user.displayName}${
            e.selectionNodeId ? ` — viewing ${e.selectionNodeId}` : ""
          }`}
        >
          {initials(e.user.displayName)}
        </span>
      ))}
      {unique.length > 4 && (
        <span className="presence-stack-more">+{unique.length - 4}</span>
      )}
    </div>
  );
}
