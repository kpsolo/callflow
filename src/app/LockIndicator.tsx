import { useEffect, useState } from "react";
import { COLLAB_TIMING, useCollab, type Lock } from "@/api";
import { useFlowStore } from "@/state/store";
import "./LockIndicator.css";

/**
 * Acquires an advisory edit lock on the current flow and renders the lock
 * status. While the local user holds the lock, sends a heartbeat every
 * `LOCK_HEARTBEAT_MS`. When someone else holds it, shows a banner with a
 * "Take over" button.
 */
export function LockIndicator() {
  const collab = useCollab();
  const flowId = useFlowStore((s) => s.entity.id);
  const [lock, setLock] = useState<Lock | null>(null);
  const me = collab.currentUser();

  // Subscribe to the lock for this flow.
  useEffect(() => {
    return collab.observeLock(flowId, setLock);
  }, [collab, flowId]);

  // Attempt to acquire on flow change; heartbeat while we hold.
  useEffect(() => {
    let alive = true;
    void collab.acquireLock(flowId).then((l) => {
      if (!alive) return;
      if (l) setLock(l);
    });

    const heartbeat = setInterval(() => {
      void collab.heartbeatLock(flowId);
    }, COLLAB_TIMING.LOCK_HEARTBEAT_MS);

    return () => {
      alive = false;
      clearInterval(heartbeat);
      // Don't release on unmount — switching entity is the right place to drop
      // the lock, and that's handled by the flow-id change effect above
      // recreating the acquire.
      void collab.releaseLock(flowId);
    };
  }, [collab, flowId]);

  const heldByMe = lock?.heldBy.id === me.id;
  const heldByOther = lock && !heldByMe;

  if (heldByOther) {
    return (
      <span className="lock-indicator is-other" role="status">
        <span className="lock-dot" />
        {lock.heldBy.displayName} is editing
        <button
          type="button"
          className="lock-takeover"
          onClick={async () => {
            const next = await collab.takeoverLock(flowId);
            setLock(next);
          }}
          title="Force-take the edit lock"
        >
          Take over
        </button>
      </span>
    );
  }

  return (
    <span className="lock-indicator" role="status" title="You hold the edit lock for this flow">
      <span className="lock-dot is-ok" />
      Editing
    </span>
  );
}
