import type { CollabClient } from "./client";
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
 * In-browser implementation of `CollabClient` that gives a single user
 * (across multiple tabs of the same origin) a working collaboration
 * experience without a backend.
 *
 *   - Identity persists in `localStorage` (cfs.collab.user.v1).
 *   - Flow metadata, comments, and activity persist per-flow in
 *     `localStorage`, keyed by flow id.
 *   - Locks, presence, and live event fan-out use `BroadcastChannel`
 *     so two tabs of the same flow really do see each other.
 *
 * Trade-offs (intentional — see docs/collaboration.md):
 *   - No cross-machine sync. localStorage is per-origin and per-browser.
 *   - Optimistic revision check is local-only; in practice a real server
 *     would enforce it.
 *   - Presence/lock heartbeat windows are short (5s heartbeat, 15s
 *     expiry) so cross-tab status feels live during development.
 *
 * Every storage key is versioned with a `.v1` suffix so a schema bump can
 * be detected and migrated explicitly.
 */

const STORAGE_VERSION = "v1";
const k = {
  user: `cfs.collab.user.${STORAGE_VERSION}`,
  flowMeta: (id: string) => `cfs.collab.meta.${id}.${STORAGE_VERSION}`,
  comments: (id: string) => `cfs.collab.comments.${id}.${STORAGE_VERSION}`,
  activity: (id: string) => `cfs.collab.activity.${id}.${STORAGE_VERSION}`,
  lock: (id: string) => `cfs.collab.lock.${id}.${STORAGE_VERSION}`,
};

const CHANNEL_NAME = "cfs-collab";

const PRESENCE_HEARTBEAT_MS = 5_000;
const PRESENCE_EXPIRY_MS = 15_000;
const LOCK_HEARTBEAT_MS = 30_000;
const LOCK_EXPIRY_MS = 120_000;
const ACTIVITY_RING_BUFFER = 200;

// ─── Internal: cross-tab message envelope ────────────────────────────────

type BroadcastMessage =
  | { kind: "user.changed"; payload: User }
  | { kind: "flow.meta.changed"; payload: { flowId: string; meta: FlowMetadata } }
  | { kind: "comments.changed"; payload: { flowId: string } }
  | { kind: "activity.recorded"; payload: { flowId: string } }
  | { kind: "lock.changed"; payload: { flowId: string; lock: Lock | null } }
  | { kind: "presence.heartbeat"; payload: PresenceEntry }
  | { kind: "presence.leave"; payload: { flowId: string; tabId: string } };

// ─── Helpers ─────────────────────────────────────────────────────────────

function uuid(): string {
  // crypto.randomUUID is available in all modern browsers/Node; fallback for jsdom.
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private-mode — swallow */
  }
}

const PALETTE = ["#4f8cff", "#06d6a0", "#ef476f", "#ffd166", "#9d4edd", "#bc6c25"];
function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ─── Implementation ──────────────────────────────────────────────────────

type Observer<T> = (value: T) => void;

interface ObserverGroup<T> {
  observers: Set<Observer<T>>;
}

export class LocalStorageClient implements CollabClient {
  private readonly channel: BroadcastChannel | null;
  private readonly tabId = uuid();

  // Per-flow observer registries.
  private readonly commentObservers = new Map<string, ObserverGroup<Comment[]>>();
  private readonly activityObservers = new Map<string, ObserverGroup<ActivityEvent[]>>();
  private readonly lockObservers = new Map<string, ObserverGroup<Lock | null>>();
  private readonly presenceObservers = new Map<string, ObserverGroup<PresenceEntry[]>>();
  private readonly userObservers = new Set<Observer<User>>();

  // Live presence: flowId -> tabId -> entry. Cleared on heartbeat expiry.
  private readonly remotePresence = new Map<string, Map<string, PresenceEntry>>();

  // Local presence intent per flow (so heartbeats know what to send).
  private readonly localPresence = new Map<string, { selectionNodeId?: string }>();
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private presenceExpiryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (this.channel) {
      this.channel.addEventListener("message", (e) => this.onBroadcast(e.data));
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.shutdown());
      // Cross-tab localStorage events still fire reliably for keys updated by
      // OTHER tabs (storage events don't fire in the writing tab).
      window.addEventListener("storage", (e) => this.onStorage(e));
    }
  }

  // ─── Identity ───────────────────────────────────────────────────────

  currentUser(): User {
    const existing = readJson<User | null>(k.user, null);
    if (existing && existing.id) return existing;
    const fresh: User = {
      id: uuid(),
      displayName: "You",
      avatarUrl: undefined,
      role: "editor",
    };
    writeJson(k.user, fresh);
    return fresh;
  }

  setDisplayName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: User = { ...this.currentUser(), displayName: trimmed };
    writeJson(k.user, next);
    this.broadcast({ kind: "user.changed", payload: next });
    this.userObservers.forEach((cb) => cb(next));
  }

  observeUser(cb: Observer<User>): Unsubscribe {
    this.userObservers.add(cb);
    return () => this.userObservers.delete(cb);
  }

  // ─── Flow metadata ─────────────────────────────────────────────────

  async saveFlow(
    flowId: string,
    _body: unknown,
    expectedRevision?: number,
  ): Promise<SaveResult> {
    const current = readJson<FlowMetadata | null>(k.flowMeta(flowId), null);
    if (
      expectedRevision != null &&
      current &&
      current.revision !== expectedRevision
    ) {
      return {
        ok: false,
        revision: current.revision,
        conflict: { latest: current, reason: "revision_stale" },
      };
    }
    const user = this.currentUser();
    const next: FlowMetadata = current
      ? {
          ...current,
          revision: current.revision + 1,
          updatedBy: user.id,
          updatedAt: nowIso(),
        }
      : {
          id: flowId,
          revision: 1,
          createdBy: user.id,
          createdAt: nowIso(),
          updatedBy: user.id,
          updatedAt: nowIso(),
        };
    writeJson(k.flowMeta(flowId), next);
    this.broadcast({ kind: "flow.meta.changed", payload: { flowId, meta: next } });
    return { ok: true, revision: next.revision };
  }

  async getFlowMetadata(flowId: string): Promise<FlowMetadata | null> {
    return readJson<FlowMetadata | null>(k.flowMeta(flowId), null);
  }

  // ─── Locks ──────────────────────────────────────────────────────────

  async acquireLock(flowId: string): Promise<Lock | null> {
    const existing = this.readLock(flowId);
    const me = this.currentUser();
    const now = Date.now();
    if (existing && new Date(existing.expiresAt).getTime() > now && existing.heldBy.id !== me.id) {
      return null;
    }
    const lock = this.makeLock(flowId, me);
    writeJson(k.lock(flowId), lock);
    this.broadcast({ kind: "lock.changed", payload: { flowId, lock } });
    this.fanoutLock(flowId, lock);
    return lock;
  }

  async heartbeatLock(flowId: string): Promise<Lock | null> {
    const existing = this.readLock(flowId);
    const me = this.currentUser();
    if (!existing || existing.heldBy.id !== me.id) return null;
    const refreshed = this.makeLock(flowId, me, existing.acquiredAt);
    writeJson(k.lock(flowId), refreshed);
    this.broadcast({ kind: "lock.changed", payload: { flowId, lock: refreshed } });
    this.fanoutLock(flowId, refreshed);
    return refreshed;
  }

  async releaseLock(flowId: string): Promise<void> {
    const existing = this.readLock(flowId);
    const me = this.currentUser();
    if (!existing || existing.heldBy.id !== me.id) return;
    if (typeof window !== "undefined") window.localStorage.removeItem(k.lock(flowId));
    this.broadcast({ kind: "lock.changed", payload: { flowId, lock: null } });
    this.fanoutLock(flowId, null);
  }

  async takeoverLock(flowId: string): Promise<Lock> {
    const me = this.currentUser();
    const lock = this.makeLock(flowId, me);
    writeJson(k.lock(flowId), lock);
    this.broadcast({ kind: "lock.changed", payload: { flowId, lock } });
    this.fanoutLock(flowId, lock);
    return lock;
  }

  observeLock(flowId: string, cb: Observer<Lock | null>): Unsubscribe {
    const group = this.lockObservers.get(flowId) ?? { observers: new Set() };
    group.observers.add(cb);
    this.lockObservers.set(flowId, group);
    // Prime with current state.
    cb(this.readLockExpiringStale(flowId));
    return () => group.observers.delete(cb);
  }

  private makeLock(flowId: string, holder: User, acquiredAt?: string): Lock {
    const now = nowIso();
    return {
      flowId,
      heldBy: { ...holder, avatarUrl: holder.avatarUrl ?? hashColor(holder.displayName) },
      acquiredAt: acquiredAt ?? now,
      lastHeartbeatAt: now,
      expiresAt: new Date(Date.now() + LOCK_EXPIRY_MS).toISOString(),
    };
  }

  private readLock(flowId: string): Lock | null {
    return readJson<Lock | null>(k.lock(flowId), null);
  }

  /** Like `readLock` but returns null when the stored lock has expired. */
  private readLockExpiringStale(flowId: string): Lock | null {
    const l = this.readLock(flowId);
    if (!l) return null;
    if (new Date(l.expiresAt).getTime() < Date.now()) return null;
    return l;
  }

  private fanoutLock(flowId: string, lock: Lock | null): void {
    this.lockObservers.get(flowId)?.observers.forEach((cb) => cb(lock));
  }

  // ─── Comments ───────────────────────────────────────────────────────

  async listComments(flowId: string): Promise<Comment[]> {
    return readJson<Comment[]>(k.comments(flowId), []);
  }

  async addComment(input: {
    flowId: string;
    anchor: CommentAnchor;
    body: string;
    parentCommentId?: string;
    flowRevisionAtPost?: number;
  }): Promise<Comment> {
    const me = this.currentUser();
    const comment: Comment = {
      id: uuid(),
      flowId: input.flowId,
      anchor: input.anchor,
      authorId: me.id,
      authorDisplayName: me.displayName,
      body: input.body,
      createdAt: nowIso(),
      flowRevisionAtPost: input.flowRevisionAtPost,
      parentCommentId: input.parentCommentId,
    };
    const list = await this.listComments(input.flowId);
    const next = [...list, comment];
    writeJson(k.comments(input.flowId), next);
    this.broadcast({ kind: "comments.changed", payload: { flowId: input.flowId } });
    this.fanoutComments(input.flowId, next);
    this.recordActivity({
      flowId: input.flowId,
      kind: "comment_added",
      payload: { commentId: comment.id, anchor: comment.anchor },
    });
    return comment;
  }

  async resolveComment(commentId: string): Promise<Comment> {
    return this.mutateComment(commentId, (c) => {
      const me = this.currentUser();
      return { ...c, resolvedAt: nowIso(), resolvedBy: me.id };
    }, "comment_resolved");
  }

  async unresolveComment(commentId: string): Promise<Comment> {
    return this.mutateComment(commentId, (c) => ({
      ...c,
      resolvedAt: undefined,
      resolvedBy: undefined,
    }), "comment_resolved");
  }

  async deleteComment(commentId: string): Promise<void> {
    // Find which flow the comment belongs to.
    for (const key of this.allFlowIds()) {
      const list = await this.listComments(key);
      const found = list.find((c) => c.id === commentId);
      if (!found) continue;
      const next = list.filter((c) => c.id !== commentId);
      writeJson(k.comments(key), next);
      this.broadcast({ kind: "comments.changed", payload: { flowId: key } });
      this.fanoutComments(key, next);
      this.recordActivity({
        flowId: key,
        kind: "comment_deleted",
        payload: { commentId },
      });
      return;
    }
  }

  observeComments(flowId: string, cb: Observer<Comment[]>): Unsubscribe {
    const group = this.commentObservers.get(flowId) ?? { observers: new Set() };
    group.observers.add(cb);
    this.commentObservers.set(flowId, group);
    void this.listComments(flowId).then((list) => cb(list));
    return () => group.observers.delete(cb);
  }

  private async mutateComment(
    commentId: string,
    mut: (c: Comment) => Comment,
    activityKind: ActivityKind,
  ): Promise<Comment> {
    for (const key of this.allFlowIds()) {
      const list = await this.listComments(key);
      const idx = list.findIndex((c) => c.id === commentId);
      if (idx === -1) continue;
      const next = [...list];
      next[idx] = mut(next[idx]);
      writeJson(k.comments(key), next);
      this.broadcast({ kind: "comments.changed", payload: { flowId: key } });
      this.fanoutComments(key, next);
      this.recordActivity({
        flowId: key,
        kind: activityKind,
        payload: { commentId },
      });
      return next[idx];
    }
    throw new Error(`Comment ${commentId} not found`);
  }

  private fanoutComments(flowId: string, list: Comment[]): void {
    this.commentObservers.get(flowId)?.observers.forEach((cb) => cb(list));
  }

  /** Walks localStorage looking for our `cfs.collab.comments.*` keys. */
  private allFlowIds(): string[] {
    if (typeof window === "undefined") return [];
    const prefix = `cfs.collab.comments.`;
    const suffix = `.${STORAGE_VERSION}`;
    const out: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix) && key.endsWith(suffix)) {
        out.push(key.slice(prefix.length, key.length - suffix.length));
      }
    }
    return out;
  }

  // ─── Activity ───────────────────────────────────────────────────────

  recordActivity(input: {
    flowId: string;
    kind: ActivityKind;
    payload?: Record<string, unknown>;
  }): void {
    const me = this.currentUser();
    const event: ActivityEvent = {
      id: uuid(),
      flowId: input.flowId,
      actorId: me.id,
      actorDisplayName: me.displayName,
      at: nowIso(),
      kind: input.kind,
      payload: input.payload,
    };
    const list = readJson<ActivityEvent[]>(k.activity(input.flowId), []);
    const next = [...list, event].slice(-ACTIVITY_RING_BUFFER);
    writeJson(k.activity(input.flowId), next);
    this.broadcast({ kind: "activity.recorded", payload: { flowId: input.flowId } });
    this.fanoutActivity(input.flowId, next);
  }

  async listActivity(flowId: string, limit?: number): Promise<ActivityEvent[]> {
    const list = readJson<ActivityEvent[]>(k.activity(flowId), []);
    if (limit && limit > 0) return list.slice(-limit);
    return list;
  }

  observeActivity(flowId: string, cb: Observer<ActivityEvent[]>): Unsubscribe {
    const group = this.activityObservers.get(flowId) ?? { observers: new Set() };
    group.observers.add(cb);
    this.activityObservers.set(flowId, group);
    void this.listActivity(flowId).then((list) => cb(list));
    return () => group.observers.delete(cb);
  }

  private fanoutActivity(flowId: string, list: ActivityEvent[]): void {
    this.activityObservers.get(flowId)?.observers.forEach((cb) => cb(list));
  }

  // ─── Presence ───────────────────────────────────────────────────────

  joinPresence(input: { flowId: string; selectionNodeId?: string }): Unsubscribe {
    this.localPresence.set(input.flowId, { selectionNodeId: input.selectionNodeId });
    this.startPresenceTimers();
    this.emitPresenceHeartbeat(input.flowId);
    return () => {
      this.localPresence.delete(input.flowId);
      this.broadcast({
        kind: "presence.leave",
        payload: { flowId: input.flowId, tabId: this.tabId },
      });
      if (this.localPresence.size === 0) this.stopPresenceTimers();
    };
  }

  updatePresence(input: { flowId: string; selectionNodeId?: string }): void {
    const existing = this.localPresence.get(input.flowId);
    if (!existing) return;
    this.localPresence.set(input.flowId, { selectionNodeId: input.selectionNodeId });
    this.emitPresenceHeartbeat(input.flowId);
  }

  observePresence(flowId: string, cb: Observer<PresenceEntry[]>): Unsubscribe {
    const group = this.presenceObservers.get(flowId) ?? { observers: new Set() };
    group.observers.add(cb);
    this.presenceObservers.set(flowId, group);
    cb(this.snapshotPresence(flowId));
    return () => group.observers.delete(cb);
  }

  private emitPresenceHeartbeat(flowId: string): void {
    const me = this.currentUser();
    const entry: PresenceEntry = {
      flowId,
      user: { ...me, avatarUrl: me.avatarUrl ?? hashColor(me.displayName) },
      lastSeen: nowIso(),
      selectionNodeId: this.localPresence.get(flowId)?.selectionNodeId,
      tabId: this.tabId,
    };
    this.broadcast({ kind: "presence.heartbeat", payload: entry });
  }

  private startPresenceTimers(): void {
    if (!this.presenceTimer) {
      this.presenceTimer = setInterval(() => {
        for (const flowId of this.localPresence.keys()) this.emitPresenceHeartbeat(flowId);
      }, PRESENCE_HEARTBEAT_MS);
    }
    if (!this.presenceExpiryTimer) {
      this.presenceExpiryTimer = setInterval(() => this.expireStalePresence(), 2_000);
    }
  }

  private stopPresenceTimers(): void {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.presenceExpiryTimer) clearInterval(this.presenceExpiryTimer);
    this.presenceTimer = null;
    this.presenceExpiryTimer = null;
  }

  private expireStalePresence(): void {
    const cutoff = Date.now() - PRESENCE_EXPIRY_MS;
    for (const [flowId, perTab] of this.remotePresence.entries()) {
      let removed = false;
      for (const [tabId, entry] of perTab.entries()) {
        if (new Date(entry.lastSeen).getTime() < cutoff) {
          perTab.delete(tabId);
          removed = true;
        }
      }
      if (removed) this.fanoutPresence(flowId);
    }
  }

  private snapshotPresence(flowId: string): PresenceEntry[] {
    const perTab = this.remotePresence.get(flowId);
    if (!perTab) return [];
    const out: PresenceEntry[] = [];
    const cutoff = Date.now() - PRESENCE_EXPIRY_MS;
    for (const e of perTab.values()) {
      if (new Date(e.lastSeen).getTime() >= cutoff) out.push(e);
    }
    return out;
  }

  private fanoutPresence(flowId: string): void {
    const snap = this.snapshotPresence(flowId);
    this.presenceObservers.get(flowId)?.observers.forEach((cb) => cb(snap));
  }

  // ─── Cross-tab plumbing ─────────────────────────────────────────────

  private broadcast(msg: BroadcastMessage): void {
    this.channel?.postMessage(msg);
  }

  private onBroadcast(msg: BroadcastMessage): void {
    switch (msg.kind) {
      case "user.changed":
        // Other tabs renamed the same identity — re-emit so observers refresh.
        this.userObservers.forEach((cb) => cb(this.currentUser()));
        break;
      case "comments.changed":
        void this.listComments(msg.payload.flowId).then((list) =>
          this.fanoutComments(msg.payload.flowId, list),
        );
        break;
      case "activity.recorded":
        void this.listActivity(msg.payload.flowId).then((list) =>
          this.fanoutActivity(msg.payload.flowId, list),
        );
        break;
      case "lock.changed":
        this.fanoutLock(msg.payload.flowId, msg.payload.lock);
        break;
      case "presence.heartbeat": {
        const { flowId, tabId } = msg.payload;
        // Ignore our own heartbeats.
        if (tabId === this.tabId) break;
        let perTab = this.remotePresence.get(flowId);
        if (!perTab) {
          perTab = new Map();
          this.remotePresence.set(flowId, perTab);
        }
        perTab.set(tabId, msg.payload);
        this.fanoutPresence(flowId);
        break;
      }
      case "presence.leave": {
        const perTab = this.remotePresence.get(msg.payload.flowId);
        if (perTab?.delete(msg.payload.tabId)) this.fanoutPresence(msg.payload.flowId);
        break;
      }
      case "flow.meta.changed":
        // Currently no per-flow metadata observer; reserved for future use.
        break;
    }
  }

  private onStorage(e: StorageEvent): void {
    // Fired only in tabs OTHER than the writer. We use it as a redundancy
    // path in case BroadcastChannel is unavailable (very old environments).
    if (!e.key) return;
    if (e.key.startsWith("cfs.collab.comments.")) {
      const flowId = this.parseFlowIdFromKey(e.key, "cfs.collab.comments.");
      if (flowId) void this.listComments(flowId).then((list) => this.fanoutComments(flowId, list));
    } else if (e.key.startsWith("cfs.collab.activity.")) {
      const flowId = this.parseFlowIdFromKey(e.key, "cfs.collab.activity.");
      if (flowId) void this.listActivity(flowId).then((list) => this.fanoutActivity(flowId, list));
    } else if (e.key.startsWith("cfs.collab.lock.")) {
      const flowId = this.parseFlowIdFromKey(e.key, "cfs.collab.lock.");
      if (flowId) this.fanoutLock(flowId, this.readLockExpiringStale(flowId));
    } else if (e.key === k.user) {
      this.userObservers.forEach((cb) => cb(this.currentUser()));
    }
  }

  private parseFlowIdFromKey(key: string, prefix: string): string | null {
    const suffix = `.${STORAGE_VERSION}`;
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;
    return key.slice(prefix.length, key.length - suffix.length);
  }

  private shutdown(): void {
    for (const flowId of this.localPresence.keys()) {
      this.broadcast({ kind: "presence.leave", payload: { flowId, tabId: this.tabId } });
    }
    this.stopPresenceTimers();
    this.channel?.close();
  }
}

// Re-export constants the UI might want to read for matching timeouts.
export const COLLAB_TIMING = {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_EXPIRY_MS,
  LOCK_HEARTBEAT_MS,
  LOCK_EXPIRY_MS,
};
