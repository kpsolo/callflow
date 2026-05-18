import { useEffect, useState } from "react";
import "./PresenceIndicator.css";

interface PresenceEntry {
  /** Stable id (would be a user id once auth is wired). */
  id: string;
  /** Display name — falls back to initials. */
  name: string;
  /** Optional color override; defaults to a hashed palette pick. */
  color?: string;
}

const STORAGE_KEY = "cfs.presence.localUser.v1";
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

function readLocalUser(): PresenceEntry {
  if (typeof window === "undefined") return { id: "anon", name: "You" };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PresenceEntry;
      if (parsed.id && parsed.name) return parsed;
    } catch {
      /* ignore */
    }
  }
  return { id: "you", name: "You" };
}

/**
 * Reserved-slot indicator for the multi-user-presence feature (P5-10).
 *
 * Visually present so the top-bar layout doesn't reshuffle when real presence
 * data lands. Today it renders only the local user (read from localStorage,
 * editable inline) and a hover tooltip explaining that collaboration is not
 * yet wired up.
 */
export function PresenceIndicator() {
  const [user, setUser] = useState<PresenceEntry>(readLocalUser);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }, [user]);

  const color = user.color ?? hashToColor(user.name);

  if (editing) {
    return (
      <input
        autoFocus
        className="presence-edit"
        value={user.name}
        onChange={(e) => setUser({ ...user, name: e.target.value })}
        onBlur={() => setEditing(false)}
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
      title={`Signed in as ${user.name} · click to rename · multi-user collaboration coming soon (P5-10)`}
      aria-label={`User: ${user.name}`}
    >
      <span className="presence-avatar" style={{ background: color }}>
        {initials(user.name)}
      </span>
    </button>
  );
}
