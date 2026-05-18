import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageClient } from "@/api/localStorageClient";

// jsdom ships localStorage; clear it between tests so state doesn't bleed.
beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

const FLOW_ID = "aa_test";

describe("LocalStorageClient — identity", () => {
  it("seeds a stable user on first access and reuses it after", () => {
    const c = new LocalStorageClient();
    const u1 = c.currentUser();
    expect(u1.id).toBeTruthy();
    expect(u1.displayName).toBe("You");
    const u2 = c.currentUser();
    expect(u2.id).toBe(u1.id);
  });

  it("setDisplayName persists and notifies observers", async () => {
    const c = new LocalStorageClient();
    const seen: string[] = [];
    c.observeUser((u) => seen.push(u.displayName));
    c.setDisplayName("Alice");
    expect(c.currentUser().displayName).toBe("Alice");
    expect(seen).toContain("Alice");
  });
});

describe("LocalStorageClient — comments", () => {
  it("adds, lists, and resolves a comment", async () => {
    const c = new LocalStorageClient();
    const added = await c.addComment({
      flowId: FLOW_ID,
      anchor: { kind: "node", nodeId: "root" },
      body: "needs review",
    });
    expect(added.id).toBeTruthy();
    const list = await c.listComments(FLOW_ID);
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe("needs review");

    const resolved = await c.resolveComment(added.id);
    expect(resolved.resolvedAt).toBeTruthy();
    const after = await c.listComments(FLOW_ID);
    expect(after[0].resolvedAt).toBeTruthy();
  });

  it("deleteComment removes the entry", async () => {
    const c = new LocalStorageClient();
    const a = await c.addComment({
      flowId: FLOW_ID,
      anchor: { kind: "flow" },
      body: "hello",
    });
    await c.deleteComment(a.id);
    const list = await c.listComments(FLOW_ID);
    expect(list).toHaveLength(0);
  });

  it("observeComments fires on add", async () => {
    const c = new LocalStorageClient();
    const snapshots: number[] = [];
    c.observeComments(FLOW_ID, (list) => snapshots.push(list.length));
    await c.addComment({
      flowId: FLOW_ID,
      anchor: { kind: "flow" },
      body: "one",
    });
    await c.addComment({
      flowId: FLOW_ID,
      anchor: { kind: "flow" },
      body: "two",
    });
    // First prime + 2 mutations = 3 snapshots; sizes 0, 1, 2.
    expect(snapshots[snapshots.length - 1]).toBe(2);
  });
});

describe("LocalStorageClient — locks", () => {
  it("acquireLock returns a Lock owned by the current user", async () => {
    const c = new LocalStorageClient();
    const me = c.currentUser();
    const lock = await c.acquireLock(FLOW_ID);
    expect(lock).not.toBeNull();
    expect(lock?.heldBy.id).toBe(me.id);
  });

  it("releaseLock clears the lock", async () => {
    const c = new LocalStorageClient();
    await c.acquireLock(FLOW_ID);
    await c.releaseLock(FLOW_ID);
    // Re-acquire should succeed cleanly — pretending we're a fresh session.
    const lock = await c.acquireLock(FLOW_ID);
    expect(lock).not.toBeNull();
  });

  it("heartbeatLock refreshes the expiry while we hold", async () => {
    const c = new LocalStorageClient();
    const a = await c.acquireLock(FLOW_ID);
    expect(a).not.toBeNull();
    // Wait a tick so the timestamp moves forward.
    await new Promise((r) => setTimeout(r, 5));
    const b = await c.heartbeatLock(FLOW_ID);
    expect(b).not.toBeNull();
    expect(new Date(b!.lastHeartbeatAt).getTime()).toBeGreaterThanOrEqual(
      new Date(a!.lastHeartbeatAt).getTime(),
    );
  });
});

describe("LocalStorageClient — activity", () => {
  it("recordActivity appends to the ring buffer", async () => {
    const c = new LocalStorageClient();
    c.recordActivity({ flowId: FLOW_ID, kind: "flow_loaded" });
    c.recordActivity({
      flowId: FLOW_ID,
      kind: "node_added",
      payload: { nodeId: "n1" },
    });
    const list = await c.listActivity(FLOW_ID);
    expect(list).toHaveLength(2);
    expect(list[1].kind).toBe("node_added");
    expect(list[1].payload).toEqual({ nodeId: "n1" });
  });

  it("observeActivity fires after recordActivity", async () => {
    const c = new LocalStorageClient();
    const snapshots: number[] = [];
    c.observeActivity(FLOW_ID, (list) => snapshots.push(list.length));
    c.recordActivity({ flowId: FLOW_ID, kind: "node_added" });
    // Allow the prime promise to settle.
    await new Promise((r) => setTimeout(r, 0));
    // The observer is called by both the synchronous fanout (event recorded)
    // and the async prime (initial list); the order is microtask-dependent.
    // We just care that the recorded event made it into at least one snapshot.
    expect(snapshots.some((n) => n >= 1)).toBe(true);
  });
});

describe("LocalStorageClient — saveFlow optimistic check", () => {
  it("first save creates revision 1", async () => {
    const c = new LocalStorageClient();
    const r = await c.saveFlow(FLOW_ID, {});
    expect(r.ok).toBe(true);
    expect(r.revision).toBe(1);
  });

  it("save with stale expectedRevision returns a conflict", async () => {
    const c = new LocalStorageClient();
    await c.saveFlow(FLOW_ID, {});
    await c.saveFlow(FLOW_ID, {});
    // Server is at revision 2 now; trying to save expecting 1 should conflict.
    const r = await c.saveFlow(FLOW_ID, {}, 1);
    expect(r.ok).toBe(false);
    expect(r.conflict?.latest.revision).toBe(2);
  });

  it("save with matching expectedRevision increments", async () => {
    const c = new LocalStorageClient();
    const first = await c.saveFlow(FLOW_ID, {});
    const second = await c.saveFlow(FLOW_ID, {}, first.revision);
    expect(second.ok).toBe(true);
    expect(second.revision).toBe(2);
  });
});
