import { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { useStore } from "zustand";
import { Palette } from "@/palette/Palette";
import { Canvas } from "@/canvas/Canvas";
import { Inspector } from "@/inspector/Inspector";
import { TimePeriodsModal } from "@/inspector/TimePeriodsModal";
import { EntitySettingsModal } from "@/inspector/EntitySettingsModal";
import { IssuesPanel, ValidationSummary } from "@/validation/IssuesPanel";
import { SimulatorPanel } from "@/simulator/SimulatorPanel";
import { ImportDialog } from "@/io/ImportDialog";
import { downloadJson } from "@/io/exportImport";
import { useFlowStore } from "@/state/store";
import { useTraceStore } from "@/state/traceStore";
import { useValidation } from "@/validation/useValidation";
import { hasErrors } from "@/validation/validate";
import { FIXTURES } from "@/fixtures";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { WelcomeBanner } from "./WelcomeBanner";
import { useResizable } from "./useResizable";
import "./Shell.css";

export function Shell() {
  const [simOpen, setSimOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const setTrace = useTraceStore((s) => s.setTrace);
  const exportFlow = useFlowStore((s) => s.exportFlow);
  const loadFlow = useFlowStore((s) => s.loadFlow);
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const entityId = useFlowStore((s) => s.entity.id);
  const matchedFixture = FIXTURES.find((f) => f.flow.entity.id === entityId);
  const issues = useValidation();
  const exportDisabled = hasErrors(issues);
  useKeyboardShortcuts();

  const inspector = useResizable({
    storageKey: "cfs.inspector.width.v1",
    defaultWidth: 320,
    min: 240,
    max: 720,
    edge: "left",
  });

  const pastStatesLen = useStore(useFlowStore.temporal, (s) => s.pastStates.length);
  const futureStatesLen = useStore(useFlowStore.temporal, (s) => s.futureStates.length);
  const undo = () => useFlowStore.temporal.getState().undo();
  const redo = () => useFlowStore.temporal.getState().redo();

  return (
    <div className="shell">
      <header className="shell-topbar">
        <div className="shell-topbar-left">
          <strong>Call Flow Studio</strong>
          <span className="shell-divider" aria-hidden />
          <select
            aria-label="Load fixture"
            value={matchedFixture?.label ?? "__custom__"}
            onChange={(e) => {
              const f = FIXTURES.find((x) => x.label === e.target.value);
              if (f) loadFlow(f.flow);
            }}
          >
            {!matchedFixture && (
              <option value="__custom__">Custom flow ({entityId})</option>
            )}
            {FIXTURES.map((f) => (
              <option key={f.label} value={f.label}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="shell-topbar-right">
          <button
            type="button"
            onClick={undo}
            disabled={pastStatesLen === 0}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={futureStatesLen === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <span className="shell-divider" aria-hidden />
          <button
            type="button"
            onClick={() => setEntityOpen(true)}
            title="Edit entity settings (name, DID, IVR language, directory)"
          >
            Entity…
          </button>
          <button
            type="button"
            onClick={() => setPeriodsOpen(true)}
            title="Manage named time periods"
          >
            Time periods…
          </button>
          <span className="shell-divider" aria-hidden />
          <button type="button" onClick={() => setImportOpen(true)} title="Import flow JSON">
            Import
          </button>
          <button
            type="button"
            onClick={() => downloadJson(exportFlow())}
            disabled={exportDisabled}
            title={
              exportDisabled
                ? "Resolve validation errors before exporting"
                : "Export flow JSON"
            }
          >
            Export
          </button>
        </div>
      </header>

      <div
        className="shell-body"
        style={{ ["--inspector-width" as string]: `${inspector.width}px` }}
      >
        <aside className="shell-palette" aria-label="Node palette">
          <Palette />
        </aside>

        <main className="shell-canvas" aria-label="Canvas">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
          <WelcomeBanner />
        </main>

        <div
          className="shell-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector"
          aria-valuenow={inspector.width}
          aria-valuemin={240}
          aria-valuemax={720}
          tabIndex={0}
          onMouseDown={inspector.startDrag}
          onDoubleClick={() => inspector.setWidth(320)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") inspector.setWidth(Math.min(720, inspector.width + 16));
            if (e.key === "ArrowRight") inspector.setWidth(Math.max(240, inspector.width - 16));
          }}
          title="Drag to resize · double-click to reset"
        />

        <aside className="shell-inspector" aria-label="Inspector">
          <Inspector />
          <hr className="shell-hr" />
          <h2 className="shell-section-title">
            Issues <ValidationSummary />
          </h2>
          <IssuesPanel />
        </aside>
      </div>

      {importOpen && (
        <ImportDialog
          hasContent={nodeCount > 0}
          onClose={() => setImportOpen(false)}
          onConfirm={(flow) => {
            loadFlow(flow);
            setImportOpen(false);
          }}
        />
      )}

      {periodsOpen && <TimePeriodsModal onClose={() => setPeriodsOpen(false)} />}
      {entityOpen && <EntitySettingsModal onClose={() => setEntityOpen(false)} />}

      <section
        className={"shell-simdrawer" + (simOpen ? " is-open" : "")}
        aria-label="Simulator"
      >
        <button
          type="button"
          className="shell-simdrawer-toggle"
          onClick={() => setSimOpen((v) => !v)}
          aria-expanded={simOpen}
        >
          {simOpen ? "▼" : "▲"} Simulator
        </button>
        {simOpen && (
          <div className="shell-simdrawer-body">
            <SimulatorPanel onTrace={setTrace} />
          </div>
        )}
      </section>
    </div>
  );
}
