import { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { useStore } from "zustand";
import { Palette } from "@/palette/Palette";
import { Canvas } from "@/canvas/Canvas";
import { Inspector } from "@/inspector/Inspector";
import { TimePeriodsModal } from "@/inspector/TimePeriodsModal";
import { EntitySettingsModal } from "@/inspector/EntitySettingsModal";
import { ValidationPill } from "@/validation/ValidationPill";
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
import { SaveStatus } from "./SaveStatus";
import { OverflowMenu } from "./OverflowMenu";
import "./Shell.css";

export function Shell() {
  const [simOpen, setSimOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const setTrace = useTraceStore((s) => s.setTrace);
  const exportFlow = useFlowStore((s) => s.exportFlow);
  const loadFlow = useFlowStore((s) => s.loadFlow);
  const markSaved = useFlowStore((s) => s.markSaved);
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const entityId = useFlowStore((s) => s.entity.id);
  const matchedFixture = FIXTURES.find((f) => f.flow.entity.id === entityId);

  const pastStatesLen = useStore(useFlowStore.temporal, (s) => s.pastStates.length);
  const futureStatesLen = useStore(useFlowStore.temporal, (s) => s.futureStates.length);
  const undo = () => useFlowStore.temporal.getState().undo();
  const redo = () => useFlowStore.temporal.getState().redo();

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

  const handleExport = () => {
    downloadJson(exportFlow());
    markSaved();
  };

  return (
    <div className="shell">
      <header className="shell-topbar">
        {/* LEFT — entity switcher, save status, validation pill */}
        <div className="shell-topbar-cluster">
          <strong className="shell-brand">Call Flow Studio</strong>
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
          <SaveStatus />
          <ValidationPill />
        </div>

        {/* CENTER — primary action (Run simulator) */}
        <div className="shell-topbar-cluster">
          <button
            type="button"
            className={"shell-sim-btn" + (simOpen ? " is-on" : "")}
            onClick={() => setSimOpen((v) => !v)}
            aria-pressed={simOpen}
            title="Open the simulator drawer"
          >
            ▶ Run simulator
          </button>
        </div>

        {/* RIGHT — undo/redo group, overflow, presence placeholder */}
        <div className="shell-topbar-cluster">
          <div className="shell-undo-group" role="group" aria-label="History">
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
          </div>
          <OverflowMenu
            items={[
              { label: "Entity settings…", icon: "⚙", onClick: () => setEntityOpen(true) },
              { label: "Time periods…", icon: "⌚", onClick: () => setPeriodsOpen(true) },
              { divider: true, label: "" },
              { label: "Import JSON…", icon: "↓", onClick: () => setImportOpen(true) },
              {
                label: "Export JSON",
                icon: "↑",
                onClick: handleExport,
                disabled: exportDisabled,
              },
              { divider: true, label: "" },
              { label: "Help / shortcuts", icon: "?", onClick: () => setHelpOpen(true) },
            ]}
          />
          {/* Reserved slot for future presence indicator (P5-10). Keeps top-bar
              width stable so the eventual addition doesn't reshuffle other items. */}
          <div className="shell-presence-slot" aria-hidden />
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
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <section
        className={"shell-simdrawer" + (simOpen ? " is-open" : "")}
        aria-label="Simulator"
      >
        <button
          type="button"
          className="shell-simdrawer-toggle"
          onClick={() => setSimOpen((v) => !v)}
          aria-expanded={simOpen}
          title={simOpen ? "Collapse simulator" : "Expand simulator"}
        >
          {simOpen ? "▼ Hide" : "▲ Simulator"}
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

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Shortcuts">
      <div className="modal" style={{ width: "min(520px, 92vw)" }}>
        <header>
          <strong>Keyboard shortcuts</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <dl className="help-dl">
            <dt>Ctrl + Z</dt>
            <dd>Undo</dd>
            <dt>Ctrl + Shift + Z</dt>
            <dd>Redo</dd>
            <dt>Ctrl + D</dt>
            <dd>Duplicate selected node</dd>
            <dt>Delete / Backspace</dt>
            <dd>Remove selected node (when not in a text field)</dd>
            <dt>Right-click</dt>
            <dd>Context menu (node, edge, or empty canvas)</dd>
            <dt>Scroll</dt>
            <dd>Zoom · drag empty canvas to pan</dd>
          </dl>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
