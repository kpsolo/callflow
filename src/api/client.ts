import type {
  ActivityEvent,
  ActivityKind,
  Comment,
  CommentAnchor,
  FlowMetadata,
  Lock,
  PresenceEntry,
  SaveResult,
  Unsubscribe,
  User,
} from "./types";

/**
 * The single seam between feature code and any collaboration backend.
 *
 * All read methods return Promises so an HTTP implementation needs no
 * adapter; observers use callback subscriptions for fan-out across
 * components (tabs, panels) without polling. The contract is intentionally
 * thin — no transports, no auth tokens, no error classes — so feature code
 * stays portable across mock and real implementations.
 */
export interface CollabClient {
  // ─── Identity ─────────────────────────────────────────────────────────

  /** Current authenticated user (or a local-only stand-in). Cheap, sync. */
  currentUser(): User;
  /** Mutate the current user's display name. Persisted by the implementation. */
  setDisplayName(name: string): void;
  /** Fire `cb` whenever `currentUser()` would return a different value. */
  observeUser(cb: (u: User) => void): Unsubscribe;

  // ─── Flow metadata ────────────────────────────────────────────────────

  /**
   * Save a flow with an optional optimistic revision check. When the server
   * already has a strictly-greater revision, returns `{ ok: false, conflict }`
   * and does NOT persist; the caller is expected to surface a conflict UI
   * and either retry or discard.
   */
  saveFlow(
    flowId: string,
    body: unknown,
    expectedRevision?: number,
  ): Promise<SaveResult>;

  /** Read metadata only (cheaper than loading the whole flow). */
  getFlowMetadata(flowId: string): Promise<FlowMetadata | null>;

  // ─── Locks (advisory, heartbeat-based) ────────────────────────────────

  /**
   * Try to acquire an advisory lock. Returns the resulting lock state, or
   * `null` when held by someone else. Locks aren't blocking — the UI shows a
   * banner and offers "Take over"; that becomes a fresh `acquireLock` after
   * the previous one is released.
   */
  acquireLock(flowId: string): Promise<Lock | null>;
  heartbeatLock(flowId: string): Promise<Lock | null>;
  releaseLock(flowId: string): Promise<void>;
  /** Force-acquire even when held by another user. */
  takeoverLock(flowId: string): Promise<Lock>;
  observeLock(flowId: string, cb: (lock: Lock | null) => void): Unsubscribe;

  // ─── Comments ─────────────────────────────────────────────────────────

  listComments(flowId: string): Promise<Comment[]>;
  addComment(input: {
    flowId: string;
    anchor: CommentAnchor;
    body: string;
    parentCommentId?: string;
    flowRevisionAtPost?: number;
  }): Promise<Comment>;
  resolveComment(commentId: string): Promise<Comment>;
  unresolveComment(commentId: string): Promise<Comment>;
  deleteComment(commentId: string): Promise<void>;
  observeComments(flowId: string, cb: (comments: Comment[]) => void): Unsubscribe;

  // ─── Activity log (append-only) ───────────────────────────────────────

  recordActivity(input: {
    flowId: string;
    kind: ActivityKind;
    payload?: Record<string, unknown>;
  }): void;
  listActivity(flowId: string, limit?: number): Promise<ActivityEvent[]>;
  observeActivity(flowId: string, cb: (events: ActivityEvent[]) => void): Unsubscribe;

  // ─── Live presence ────────────────────────────────────────────────────

  /**
   * Register interest in a flow and start emitting heartbeats. Returns an
   * unsubscribe that withdraws from the channel. Callers should set
   * `enabled = false` (or unsubscribe entirely) when the flow is closed.
   */
  joinPresence(input: {
    flowId: string;
    selectionNodeId?: string;
  }): Unsubscribe;

  /** Update the locally-attached presence payload (e.g. selection changed). */
  updatePresence(input: { flowId: string; selectionNodeId?: string }): void;

  /** Observe the set of users currently viewing a flow (excluding self). */
  observePresence(
    flowId: string,
    cb: (entries: PresenceEntry[]) => void,
  ): Unsubscribe;
}
