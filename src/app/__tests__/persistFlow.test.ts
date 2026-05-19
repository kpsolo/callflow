import { describe, expect, it, beforeEach } from "vitest";
import { ext401Screening } from "@/fixtures/ext401Screening";
import { acme3DeptAa } from "@/fixtures/acme3DeptAa";
import { useFlowStore } from "@/state/store";
import {
  persistFlow,
  restoreAutosave,
  restoreSavedForEntity,
  hasSaveForEntity,
  clearAutosave,
} from "../useAutosave";

const KEY = "callflow.autosave.v2";
const KEY_V1 = "callflow.autosave.flow.v1";

describe("Save → localStorage → restore round-trip (per-entity)", () => {
  beforeEach(() => {
    clearAutosave();
  });

  it("writes the current flow keyed by entity.id on persistFlow()", () => {
    useFlowStore.getState().loadFlow(ext401Screening);
    expect(persistFlow()).toBe(true);
    const raw = localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.lastEntityId).toBe("ext_401");
    expect(parsed.entities.ext_401.entity.id).toBe("ext_401");
  });

  it("restoreSavedForEntity brings back exactly that entity's snapshot", () => {
    useFlowStore.getState().loadFlow(ext401Screening);
    persistFlow();
    useFlowStore.getState().clearFlow();
    expect(restoreSavedForEntity("ext_401")).toBe(true);
    expect(useFlowStore.getState().entity.id).toBe("ext_401");
  });

  it("preserves moved positions when re-picking the same entity", () => {
    useFlowStore.getState().loadFlow(ext401Screening);
    // Simulate the user dragging a node.
    useFlowStore.getState().onNodesChange([
      { id: "rule_vip", type: "position", position: { x: 999, y: 999 }, dragging: false },
    ]);
    persistFlow();

    // Switch to another fixture (the user picks something else in the dropdown).
    useFlowStore.getState().loadFlow(acme3DeptAa);
    expect(useFlowStore.getState().entity.id).toBe("aa_acme");

    // Switch back: restoreSavedForEntity should bring the moved-position
    // version back, NOT the pristine fixture.
    expect(restoreSavedForEntity("ext_401")).toBe(true);
    const node = useFlowStore.getState().nodes.find((n) => n.id === "rule_vip")!;
    expect(node.position).toEqual({ x: 999, y: 999 });
  });

  it("restoreSavedForEntity returns false when nothing's saved for that id", () => {
    useFlowStore.getState().loadFlow(ext401Screening);
    persistFlow();
    expect(restoreSavedForEntity("aa_acme")).toBe(false);
  });

  it("restoreAutosave loads the last-saved entity on app open", () => {
    useFlowStore.getState().loadFlow(ext401Screening);
    persistFlow();
    useFlowStore.getState().loadFlow(acme3DeptAa);
    persistFlow(); // last-saved is now aa_acme
    useFlowStore.getState().clearFlow();
    expect(restoreAutosave()).toBe(true);
    expect(useFlowStore.getState().entity.id).toBe("aa_acme");
  });

  it("multiple entities can coexist in storage", () => {
    useFlowStore.getState().loadFlow(ext401Screening);
    persistFlow();
    useFlowStore.getState().loadFlow(acme3DeptAa);
    persistFlow();
    expect(hasSaveForEntity("ext_401")).toBe(true);
    expect(hasSaveForEntity("aa_acme")).toBe(true);
  });

  it("migrates a v1 single-flow blob into the v2 dictionary on first read", () => {
    // Stuff a synthetic v1 blob into storage, then ask for the saved state.
    const oldFlow = ext401Screening;
    localStorage.setItem(KEY_V1, JSON.stringify(oldFlow));
    expect(hasSaveForEntity("ext_401")).toBe(true);
    // v1 key should be gone after migration.
    expect(localStorage.getItem(KEY_V1)).toBeNull();
    // v2 key should now hold the migrated dictionary.
    const raw = localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const blob = JSON.parse(raw!);
    expect(blob.lastEntityId).toBe("ext_401");
  });

  it("returns false on restoreAutosave when nothing's saved", () => {
    expect(restoreAutosave()).toBe(false);
  });
});
