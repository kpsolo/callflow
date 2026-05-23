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
import { FlowSwitcher, type FlowSwitcherOption } from "./FlowSwitcher";
import { emptyFlow, type Entity } from "@/schema";
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
import { cloneFlowWithFreshIds } from "@/state/cloneFlow";
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
  const entity = useFlowStore((s) => s.entity);
  const entityId = entity.id;
  const matchedFixture = FIXTURES.find((f) => f.flow.entity.id === entityId);
  const entityTypeLabel =
    entity.type === "auto_attendant" ? "Auto Attendant" : "Extension";
  const entityNumber =
    entity.type === "auto_attendant" ? entity.did : entity.extension;

  // Build the switcher option list once. The "custom" sentinel only appears
  // when the loaded entity isn't backed by a known fixture, so users don't
  // see a confusing "Custom flow" line for fixture-backed flows.
  const switcherOptions: FlowSwitcherOption[] = [
    ...(!matchedFixture
      ? [
          {
            id: "__custom__",
            flow: useFlowStore.getState().exportFlow(),
            label: `Custom flow (${entityId})`,
            current: true,
          },
        ]
      : []),
    ...FIXTURES.map((f) => ({
      id: f.flow.entity.id,
      flow: f.flow,
      label: f.label,
      current: !!matchedFixture && matchedFixture.label === f.label,
    })),
  ];

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
        {/* LEFT — the entire identity area IS the flow switcher trigger.
            Click anywhere on the icon / eyebrow / name / DID / chevron to
            open the popover. There's no separate brand wordmark or
            standalone identity block competing for the user's attention. */}
        <div className="shell-topbar-cluster">
          <FlowSwitcher
            options={switcherOptions}
            current={{
              eyebrow: entityTypeLabel,
              name: entity.name,
              number: entityNumber,
              isAA: entity.type === "auto_attendant",
            }}
            onSelect={(opt) => {
              if (opt.id === "__custom__") return;
              if (!restoreSavedForEntity(opt.flow.entity.id)) {
                loadFlow(opt.flow);
              }
              useFlowStore.temporal.getState().clear();
            }}
            onCreateNew={(strategy) => {
              const id = `${Date.now().toString(36)}_${Math.random()
                .toString(36)
                .slice(2, 6)}`;

              if (strategy.kind === "blank") {
                // From scratch: fresh empty flow with a default entity.
                const newEntity: Entity =
                  strategy.entityKind === "auto_attendant"
                    ? {
                        type: "auto_attendant",
                        id: `aa_${id}`,
                        did: "+10000000000",
                        name: "New Auto Attendant",
                        directory: [],
                      }
                    : {
                        type: "extension",
                        id: `ext_${id}`,
                        extension: "000",
                        name: "New Extension",
                      };
                loadFlow(emptyFlow(newEntity));
              } else {
                // Clone: copy the source flow's nodes/edges/scenarios but
                // mint a fresh entity stub so the new flow doesn't collide
                // with the source's identity. Entity type is inherited from
                // the source — cloning across types would mismatch node
                // kinds (menu nodes don't belong in an extension flow).
                const src = switcherOptions.find(
                  (o) => o.id === strategy.sourceFlowId,
                )?.flow;
                if (!src) return;
                const newEntity: Entity =
                  src.entity.type === "auto_attendant"
                    ? {
                        type: "auto_attendant",
                        id: `aa_${id}`,
                        did: src.entity.did,
                        name: `Copy of ${src.entity.name}`,
                        directory: src.entity.directory,
                        time_periods: src.entity.time_periods,
                        preferred_ivr_language: src.entity.preferred_ivr_language,
                      }
                    : {
                        type: "extension",
                        id: `ext_${id}`,
                        extension: src.entity.extension,
                        name: `Copy of ${src.entity.name}`,
                        time_periods: src.entity.time_periods,
                        preferred_ivr_language: src.entity.preferred_ivr_language,
                      };
                // Re-mint node/edge ids so the clone doesn't collide with the
                // source if both ever end up loaded together (compare view,
                // multi-flow workspace, paste-between-flows).
                loadFlow({
                  ...cloneFlowWithFreshIds(src),
                  entity: newEntity,
                });
              }
              useFlowStore.temporal.getState().clear();
              setEntityOpen(true);
            }}
          />
        </div>

        {/* CENTER — reserved (empty for now). */}
        <div className="shell-topbar-cluster" />

        {/* RIGHT — issues pill, Save, undo/redo, Help, overflow. */}
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
          {/* Help promoted out of the overflow menu — it's the kind of
              affordance you want one click away, not three. */}
          <button
            type="button"
            className="shell-icon-btn"
            onClick={() => setHelpOpen(true)}
            title="Help / shortcuts (?)"
            aria-label="Help"
          >
            <HelpCircle size={16} aria-hidden />
          </button>
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
            <Canvas
              simulatorOpen={simOpen}
              onOpenSimulator={() => setSimOpen(true)}
              onCloseSimulator={() => setSimOpen(false)}
            />
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
