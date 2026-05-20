import { useEffect, useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { useStore } from "zustand";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  HelpCircle,
  Layers,
  List,
  Settings,
  Undo2,
  Redo2,
  Upload,
  X,
} from "lucide-react";
import { Palette } from "@/palette/Palette";
import { Canvas } from "@/canvas/Canvas";
import { Inspector } from "@/inspector/Inspector";
import { TimePeriodsModal } from "@/inspector/TimePeriodsModal";
import { EntitySettingsModal } from "@/inspector/EntitySettingsModal";
import { StatusPill } from "./StatusPill";
import { SaveButton } from "./SaveButton";
import { restoreAutosave, restoreSavedForEntity } from "./useAutosave";
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
import { OverflowMenu } from "./OverflowMenu";
import { ActivityLogModal } from "./ActivityLogModal";
import { useActivityRecorder } from "@/state/useActivityRecorder";
import { useUiStore } from "@/state/uiStore";
import "./Shell.css";

export function Shell() {
  const [simOpen, setSimOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  // Stream structural store changes into the collaboration activity log.
  useActivityRecorder();
  // Restore the most recent Save (localStorage today, server later) on first
  // mount. No continuous autosave — persistence is explicit via the Save button.
  useEffect(() => {
    restoreAutosave();
  }, []);

  const setTrace = useTraceStore((s) => s.setTrace);
  const exportFlow = useFlowStore((s) => s.exportFlow);
  const loadFlow = useFlowStore((s) => s.loadFlow);
  const markSaved = useFlowStore((s) => s.markSaved);
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const entityId = useFlowStore((s) => s.entity.id);
  const matchedFixture = FIXTURES.find((f) => f.flow.entity.id === entityId);

  // Clear trace if the simulator panel is collapsed or closed.
  useEffect(() => {
    if (!simOpen) {
      setTrace(null);
    }
  }, [simOpen, setTrace]);

  // Clear trace if the active flow entity changes (e.g. preset/fixture switch).
  useEffect(() => {
    setTrace(null);
  }, [entityId, setTrace]);

  const pastStatesLen = useStore(useFlowStore.temporal, (s) => s.pastStates.length);
  const futureStatesLen = useStore(useFlowStore.temporal, (s) => s.futureStates.length);
  const undo = () => useFlowStore.temporal.getState().undo();
  const redo = () => useFlowStore.temporal.getState().redo();

  const issues = useValidation();
  const exportDisabled = hasErrors(issues);
  useKeyboardShortcuts();

  const showNodeIds = useUiStore((s) => s.showNodeIds);
  const setShowNodeIds = useUiStore((s) => s.setShowNodeIds);
  const nodeVersion = useUiStore((s) => s.nodeVersion);
  const setNodeVersion = useUiStore((s) => s.setNodeVersion);

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
        {/* LEFT — entity switcher + open-simulator + lock indicator */}
        <div className="shell-topbar-cluster">
          <strong className="shell-brand">Call Flow Studio</strong>
          <span className="shell-divider" aria-hidden />
          <select
            aria-label="Load fixture"
            value={matchedFixture?.label ?? "__custom__"}
            onChange={(e) => {
              const f = FIXTURES.find((x) => x.label === e.target.value);
              if (!f) return;
              // Prefer the user's saved version of this entity over the
              // pristine fixture, so picking the same entry twice doesn't
              // wipe their work.
              if (!restoreSavedForEntity(f.flow.entity.id)) {
                loadFlow(f.flow);
              }
              // Reset undo history — keeping it across a fixture switch would
              // let Ctrl+Z revert into a different entity, which is confusing.
              useFlowStore.temporal.getState().clear();
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
          <button
            type="button"
            className={"shell-sim-btn" + (simOpen ? " is-on" : "")}
            onClick={() => setSimOpen((v) => !v)}
            aria-pressed={simOpen}
            title="Open the simulator drawer"
          >
            Open simulator
          </button>
        </div>

        {/* CENTER — reserved (empty for now). */}
        <div className="shell-topbar-cluster" />

        {/* RIGHT — issues pill (only when issues exist), Save (mocked),
            undo/redo, overflow, presence. The collab LockIndicator is
            intentionally hidden for now — re-enable once real-time
            collaboration lands. */}
        <div className="shell-topbar-cluster">
          <StatusPill />
          <SaveButton />
          <div className="shell-undo-group" role="group" aria-label="History">
            <button
              type="button"
              className="shell-icon-btn"
              onClick={undo}
              disabled={pastStatesLen === 0}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="shell-icon-btn"
              onClick={redo}
              disabled={futureStatesLen === 0}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 size={16} aria-hidden />
            </button>
          </div>
          <OverflowMenu
            items={[
              {
                label: "Entity settings…",
                icon: <Settings size={14} />,
                onClick: () => setEntityOpen(true),
              },
              {
                label: "Time periods…",
                icon: <Clock size={14} />,
                onClick: () => setPeriodsOpen(true),
              },
              { divider: true, label: "" },
              {
                label: "Activity log…",
                icon: <List size={14} />,
                onClick: () => setActivityOpen(true),
              },
              { divider: true, label: "" },
              {
                label: "Import JSON…",
                icon: <Upload size={14} />,
                onClick: () => setImportOpen(true),
              },
              {
                label: "Export JSON",
                icon: <Download size={14} />,
                onClick: handleExport,
                disabled: exportDisabled,
              },
              { divider: true, label: "" },
              {
                label: "Show node IDs",
                checked: showNodeIds,
                onClick: () => setShowNodeIds(!showNodeIds),
              },
              { divider: true, label: "" },
              {
                label: "Node UI",
                icon: <Layers size={14} />,
                children: [
                  {
                    label: "v1 — edit in sidebar",
                    checked: nodeVersion === "v1",
                    onClick: () => setNodeVersion("v1"),
                  },
                  {
                    label: "v2 — edit inside nodes",
                    checked: nodeVersion === "v2",
                    onClick: () => setNodeVersion("v2"),
                  },
                ],
              },
              { divider: true, label: "" },
              {
                label: "Help / shortcuts",
                icon: <HelpCircle size={14} />,
                onClick: () => setHelpOpen(true),
              },
            ]}
          />
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
          <Inspector onEditEntity={() => setEntityOpen(true)} />
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
      {activityOpen && <ActivityLogModal onClose={() => setActivityOpen(false)} />}

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
          {simOpen ? (
            <>
              <ChevronDown size={14} aria-hidden /> Hide
            </>
          ) : (
            <>
              <ChevronUp size={14} aria-hidden /> Simulator
            </>
          )}
        </button>
        {simOpen && (
          <div className="shell-simdrawer-body">
            <SimulatorPanel onTrace={setTrace} onClose={() => setSimOpen(false)} />
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
            <X size={14} aria-hidden />
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
