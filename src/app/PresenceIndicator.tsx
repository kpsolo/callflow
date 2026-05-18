import { useEffect, useState } from "react";
import { useCollab, type User } from "@/api";
import "./PresenceIndicator.css";

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
 * The local-user identity surface. Reads the current user from the
 * collaboration client; rename writes back through `setDisplayName` so all
 * tabs and any future server implementation see the change uniformly.
 */
export function PresenceIndicator() {
  const collab = useCollab();
  const [user, setUser] = useState<User>(() => collab.currentUser());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    return collab.observeUser((u) => setUser(u));
  }, [collab]);

  const color = user.avatarUrl ?? hashToColor(user.displayName);

  if (editing) {
    return (
      <input
        autoFocus
        className="presence-edit"
        defaultValue={user.displayName}
        onBlur={(e) => {
          collab.setDisplayName(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Your display name"
        maxLength={32}
      />
    );
  }

  return (
    <button
      type="button"
      className="presence"
      onClick={() => setEditing(true)}
      title={`Signed in as ${user.displayName} — click to rename`}
      aria-label={`User: ${user.displayName}`}
    >
      <span className="presence-avatar" style={{ background: color }}>
        {initials(user.displayName)}
      </span>
    </button>
  );
}
