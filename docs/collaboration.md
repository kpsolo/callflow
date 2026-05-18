# Collaboration

How Call Flow Studio handles identity, comments, activity, locks, and
presence — and how to swap the current local-only backend for a real
server later.

## Architecture

Feature code never talks to storage directly. It talks to a single
interface:

```
   ┌──────────────────────────────┐
   │ React features               │
   │ - PresenceIndicator          │
   │ - LockIndicator              │
   │ - PresenceStack              │
   │ - CommentsPanel              │
   │ - ActivityLogModal           │
   │ - useActivityRecorder        │
   └────────────┬─────────────────┘
                │ useCollab() → CollabClient
                ▼
   ┌──────────────────────────────┐
   │ CollabProvider (React Ctx)   │
   └────────────┬─────────────────┘
                │
                ▼
   ┌──────────────────────────────┐    ┌──────────────────────────────┐
   │ LocalStorageClient (default) │ or │ HttpCollabClient (future)    │
   │ localStorage + BroadcastCh.  │    │ REST + WebSocket             │
   └──────────────────────────────┘    └──────────────────────────────┘
```

The contract is intentionally thin (`src/api/client.ts`):

- Identity: `currentUser()`, `setDisplayName(name)`, `observeUser(cb)`.
- Flow metadata: `saveFlow(id, body, expectedRevision?)`, `getFlowMetadata(id)`.
- Locks: `acquireLock`, `heartbeatLock`, `releaseLock`, `takeoverLock`,
  `observeLock`.
- Comments: `listComments`, `addComment`, `resolveComment`,
  `unresolveComment`, `deleteComment`, `observeComments`.
- Activity: `recordActivity`, `listActivity`, `observeActivity`.
- Presence: `joinPresence`, `updatePresence`, `observePresence`.

All read operations are `Promise`-returning so an HTTP backend needs no
adapter; live updates use callback-based `observeXxx(flowId, cb)`
subscriptions that return an unsubscribe function.

## The default backend: `LocalStorageClient`

Single-browser, cross-tab. Implements every method in the contract using
two browser primitives:

- **`localStorage`** for durable per-flow state — comments, activity,
  flow metadata, the current lock, the local user identity. Keys are
  versioned (`cfs.collab.<topic>.<flowId>.v1`).
- **`BroadcastChannel`** for cross-tab fan-out — every tab listens on a
  shared channel and receives `comments.changed`, `lock.changed`,
  `presence.heartbeat`, etc. The same-origin `storage` event is wired as
  a fallback for environments where BroadcastChannel isn't available.

Timing constants live in `COLLAB_TIMING`:

| Constant | Default | Purpose |
|---|---|---|
| `PRESENCE_HEARTBEAT_MS` | 5,000 | How often each tab announces itself. |
| `PRESENCE_EXPIRY_MS` | 15,000 | When a peer is dropped from the presence list. |
| `LOCK_HEARTBEAT_MS` | 30,000 | How often the holder refreshes the lock. |
| `LOCK_EXPIRY_MS` | 120,000 | When an idle lock auto-expires. |
| `ACTIVITY_RING_BUFFER` | 200 | Per-flow ring buffer cap. |

### What works in the default backend
- Single user across multiple tabs of the same origin.
- Two tabs editing → they see each other's avatar in the top bar.
- One tab acquires the lock; the other sees "Alice is editing — Take over".
- Comments and activity made in tab A appear live in tab B.
- Renaming the local user propagates to all open tabs.

### What's local-only
- No cross-machine sync. Two laptops can't see each other.
- Optimistic-revision check is local — a real server would enforce it
  authoritatively.
- Tab identity is per-session, so refreshing a tab makes a fresh tab id;
  the user id is stable.

## Swapping in a real backend

Implement `CollabClient` against your transport:

```ts
import { CollabProvider, type CollabClient } from "@/api";

class HttpCollabClient implements CollabClient {
  currentUser() { /* ... */ }
  setDisplayName(name) { /* PATCH /users/me */ }
  observeUser(cb) { /* SSE / WebSocket */ }
  async saveFlow(id, body, expectedRevision) {
    const res = await fetch(`/api/flows/${id}`, {
      method: "PUT",
      headers: { "If-Match": String(expectedRevision ?? 0) },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const conflict = await res.json();
      return { ok: false, revision: conflict.latest.revision, conflict };
    }
    const r = await res.json();
    return { ok: true, revision: r.revision };
  }
  // ... and so on
}

// main.tsx
<CollabProvider client={new HttpCollabClient()}>
  <App />
</CollabProvider>
```

No feature component needs to change.

### Suggested backend storage shape

```
users
  id                uuid pk
  email, display_name, avatar_url
  tenant_roles      jsonb { tenant_id: "viewer" | "editor" | "admin" }

flows
  id                pk (== entity.id)
  body              jsonb (the FlowSchema payload)
  revision          bigint, monotonically increased on PUT
  created_by/at, updated_by/at
  tenant_id

flow_locks
  flow_id           fk pk
  held_by           fk users.id
  acquired_at, last_heartbeat_at, expires_at

comments
  id                uuid pk
  flow_id, anchor_kind, anchor_node_id, anchor_edge_id, author_id
  body, created_at, resolved_at, resolved_by
  parent_comment_id self-fk
  flow_revision_at_post

activity_log
  id                uuid pk
  flow_id, actor_id, at, kind, payload jsonb
```

Real-time channels (over WebSocket / SSE):
- `flow.<id>.comments` — emit on add / resolve / delete.
- `flow.<id>.activity` — emit on each recordActivity.
- `flow.<id>.lock` — emit on acquire / heartbeat / release / takeover.
- `flow.<id>.presence` — emit on heartbeat / leave.

The HTTP API is roughly four endpoints per topic
(GET list / POST create / POST :id/resolve / DELETE :id) plus the
WebSocket. None of the components in this app care about transport — they
only consume the `observeXxx` callbacks.

## Per-feature notes

### Identity (`PresenceIndicator`)
Reads from `collab.currentUser()` and writes back via
`setDisplayName`. Stable user id is generated on first access (lazy) and
stored in `localStorage` under `cfs.collab.user.v1`. Future server-backed
implementations should ignore this seed and use the auth identity.

### Comments (`CommentsPanel`, per-node badge)
Anchored to `{kind: "node"|"edge"|"flow", ...}` so they survive
auto-layout. The Inspector renders a comments section beneath the field
list whenever a node is selected; the canvas node shows an unresolved-count
chip on its header (`💬 N`). Resolved comments are hidden by default and
revealed via a "Show resolved" toggle.

The `flowRevisionAtPost` field is captured today but not yet rendered;
future UI can mark comments as "before recent changes" when the live
revision diverges.

### Lock (`LockIndicator`)
Lifecycle:
- On mount / flow change: `acquireLock(flowId)`. If null (someone else
  holds it), the banner shows "Take over".
- While the local user holds: `heartbeatLock` every 30s.
- On unmount / flow change: `releaseLock`.

The lock is advisory — taking over doesn't block the previous holder;
both tabs would then race to save. The server should reject the stale
holder's save via the `expectedRevision` mechanism.

### Presence (`PresenceStack`)
Joins the presence channel on mount, leaves on unmount. Local selection
changes (clicking a different node in the canvas) are pushed via
`updatePresence` so the tooltip on remote avatars shows what they're
looking at. Avatars are de-duped by user id when one user has multiple
tabs open.

### Activity log (`ActivityLogModal`, `useActivityRecorder`)
`useActivityRecorder` is a no-mutation observer attached to the Zustand
store. On every change it diffs the previous snapshot against the new
one and emits structured events: `node_added`, `node_removed`,
`node_renamed`, `edge_added`, `menu_action_retargeted`, etc.

The viewer is reachable from the top-bar overflow `⋯ → Activity log…`.
Newest first. Ring buffer of 200 most recent per flow.

## Testing

`src/api/__tests__/localStorageClient.test.ts` covers:
- Identity seed + rename observer.
- Comments: add / list / resolve / delete / observe.
- Locks: acquire / release / heartbeat.
- Activity: record / list / observe.
- saveFlow optimistic-revision check (success + conflict).

13 tests as of this commit. The full project test suite is at 99 passing.

## Migration notes

- The CollabProvider is mounted in `src/main.tsx`. If you start
  server-rendering, mount it on the server too with a no-op client (the
  features can render an empty state when no client is present, though
  the hook currently throws — easy to relax).
- Existing `localStorage` data from a single user survives the swap: the
  server-backed implementation can read the local data once on first
  login and import it as the seed for the cloud account.
- All storage keys are `.v1` suffixed; a future breaking change should
  bump the suffix and add a migration step.
