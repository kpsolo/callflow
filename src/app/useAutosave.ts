import { FlowSchema, type Flow } from "@/schema";
import { useFlowStore } from "@/state/store";

/**
 * Browser-local persistence helpers. Today the Save button is mocked and
 * writes here; once the server lands these become API calls.
 *
 * Storage shape (v2) is keyed by entity.id, with a `lastEntityId` pointer for
 * "restore on app open":
 *
 *   {
 *     "entities": {
 *       "aa_acme_hq":  { ...Flow },
 *       "ext_401":     { ...Flow },
 *     },
 *     "lastEntityId": "aa_acme_hq"
 *   }
 *
 * Per-entity is what the user expects: picking the same fixture from the
 * dropdown twice in a row should NOT wipe their drag-positions. The v1
 * single-flow layout couldn't represent that; we transparently migrate any
 * v1 blob into the new shape on first read.
 *
 * No continuous autosave — every write happens because the user clicked Save.
 */

const KEY = "callflow.autosave.v2";
const KEY_V1 = "callflow.autosave.flow.v1";

interface AutosaveBlob {
  entities: Record<string, Flow>;
  lastEntityId: string | null;
}

function emptyBlob(): AutosaveBlob {
  return { entities: {}, lastEntityId: null };
}

function readBlob(): AutosaveBlob {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as { entities?: unknown; lastEntityId?: unknown };
        return {
          entities:
            obj.entities && typeof obj.entities === "object"
              ? (obj.entities as Record<string, Flow>)
              : {},
          lastEntityId:
            typeof obj.lastEntityId === "string" ? obj.lastEntityId : null,
        };
      }
    }
    // Migration: a v1 single-flow blob → v2 dictionary keyed by entity.id.
    const oldRaw = localStorage.getItem(KEY_V1);
    if (oldRaw) {
      const oldFlow = JSON.parse(oldRaw) as { entity?: { id?: unknown } };
      const oldId =
        oldFlow && typeof oldFlow.entity?.id === "string" ? oldFlow.entity.id : null;
      if (oldId) {
        const migrated: AutosaveBlob = {
          entities: { [oldId]: oldFlow as Flow },
          lastEntityId: oldId,
        };
        try {
          localStorage.setItem(KEY, JSON.stringify(migrated));
          localStorage.removeItem(KEY_V1);
        } catch {
          // ignore quota errors during migration
        }
        return migrated;
      }
    }
  } catch {
    // fall through — start fresh
  }
  return emptyBlob();
}

function writeBlob(blob: AutosaveBlob): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(blob));
    return true;
  } catch {
    return false;
  }
}

/** True iff we have a saved snapshot for this exact entity. Cheap; safe to
 *  call from render code (no React side-effects). */
export function hasSaveForEntity(entityId: string): boolean {
  return !!readBlob().entities[entityId];
}

/**
 * Load the saved snapshot for `entityId` if one exists. Returns true on hit,
 * false if nothing's saved for that entity (caller should fall back to a
 * pristine fixture or default state).
 */
export function restoreSavedForEntity(entityId: string): boolean {
  const blob = readBlob();
  const flow = blob.entities[entityId];
  if (!flow) return false;
  const parsed = FlowSchema.safeParse(flow);
  if (!parsed.success) {
    // Stale shape — drop the bad entry but keep siblings.
    delete blob.entities[entityId];
    if (blob.lastEntityId === entityId) blob.lastEntityId = null;
    writeBlob(blob);
    return false;
  }
  useFlowStore.getState().loadFlow(parsed.data);
  return true;
}

/**
 * Initial-app-open restore. Loads the entity that was last persisted via
 * Save, if any. Returns true when a restore actually happened.
 */
export function restoreAutosave(): boolean {
  const blob = readBlob();
  if (!blob.lastEntityId) return false;
  return restoreSavedForEntity(blob.lastEntityId);
}

/**
 * Persist the current flow under its entity.id, marking it as the most
 * recently saved entity. Called by the (mocked) Save button.
 */
export function persistFlow(): boolean {
  try {
    const flow = useFlowStore.getState().exportFlow();
    const blob = readBlob();
    blob.entities[flow.entity.id] = flow;
    blob.lastEntityId = flow.entity.id;
    return writeBlob(blob);
  } catch {
    return false;
  }
}

/** Wipe every saved snapshot. Useful for tests and a future "reset everything"
 *  affordance. */
export function clearAutosave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_V1);
  } catch {
    // ignore
  }
}
