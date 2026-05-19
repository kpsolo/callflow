/**
 * Collaboration API — pure shared types.
 *
 * These types are the contract between feature code (Inspector, top bar,
 * etc.) and whatever backend implements `CollabClient`. Today the only
 * implementation is `LocalStorageClient`; a future server-backed
 * implementation just needs to satisfy the same shapes.
 *
 * Everything here is JSON-serializable so requests/responses cross a wire
 * without surgery.
 */

export interface User {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  /** Role within the current tenant. UI uses this to hint capabilities;
   *  servers MUST enforce authoritatively. */
  role?: "viewer" | "editor" | "admin";
}

/**
 * Metadata stored alongside each flow on the server. The flow body itself
 * stays inside the `FlowSchema` payload; metadata is what enables
 * collaboration features (revision check, audit fields, tagging).
 */
export interface FlowMetadata {
  id: string;
  /** Monotonically increasing integer; server rejects saves with stale `expectedRevision`. */
  revision: number;
  createdBy: string;
  createdAt: string; // ISO 8601
  updatedBy: string;
  updatedAt: string;
  tags?: string[];
}

/**
 * Advisory edit lock — heartbeat-based. The owner sends `heartbeatLock`
 * periodically; the server expires the lock when no heartbeat arrives within
 * a window (default ~2 minutes). Second editors see a banner and can
 * "Take over" without waiting.
 */
export interface Lock {
  flowId: string;
  heldBy: User;
  acquiredAt: string;
  lastHeartbeatAt: string;
  expiresAt: string;
}

export type CommentAnchor =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string }
  | { kind: "flow" };

export interface Comment {
  id: string;
  flowId: string;
  /** Flow revision when the comment was posted — lets the UI flag stale
   *  comments after large changes. Optional because not all clients track it. */
  flowRevisionAtPost?: number;
  anchor: CommentAnchor;
  authorId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  /** For threaded replies — null/undefined for the top-level comment. */
  parentCommentId?: string;
  /** User ids mentioned in `body` via the @name UI. */
  mentions?: string[];
}

export type ActivityKind =
  | "flow_loaded"
  | "flow_exported"
  | "flow_imported"
  | "flow_cleared"
  | "node_added"
  | "node_removed"
  | "node_duplicated"
  | "node_renamed"
  | "node_data_changed"
  | "edge_added"
  | "edge_removed"
  | "menu_action_retargeted"
  | "forwarding_rule_changed"
  | "time_period_changed"
  | "entity_renamed"
  | "lock_acquired"
  | "lock_released"
  | "lock_taken_over"
  | "comment_added"
  | "comment_resolved"
  | "comment_deleted"
  | "manual_checkpoint"
  | "version_restored";

export interface ActivityEvent {
  id: string;
  flowId: string;
  actorId: string;
  actorDisplayName: string;
  at: string; // ISO 8601
  kind: ActivityKind;
  /** Free-shape per `kind`. Example for `node_added`: { nodeId, nodeKind }. */
  payload?: Record<string, unknown>;
}

/**
 * Live presence is a transient stream — never persisted. A user joining a
 * flow heartbeats; observers see who's currently viewing. Cursor / selection
 * fields are optional and only sent when explicitly enabled.
 */
export interface PresenceEntry {
  flowId: string;
  user: User;
  lastSeen: string;
  selectionNodeId?: string;
  /** Tab id distinguishes the same user across multiple browser tabs. */
  tabId: string;
}

/**
 * Returned from save calls. `revision` is the post-save value the client
 * should send on its next save (or after a 409 conflict, the value the
 * client must reconcile against).
 */
export interface SaveResult {
  ok: boolean;
  revision: number;
  /** Set when the server already had a newer revision than expected. */
  conflict?: { latest: FlowMetadata; reason: string };
}

export type Unsubscribe = () => void;
