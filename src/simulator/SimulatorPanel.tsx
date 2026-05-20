import { useMemo, useState } from "react";
import { useFlowStore } from "@/state/store";
import { simulate } from "./engine";
import type { SimulatorInput, Trace } from "./types";
import type { MenuInputKey, NodeKind } from "@/schema";
import { getNodeIcon } from "@/nodes/icons";
import { Play, RotateCcw, Delete, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import "./SimulatorPanel.css";

const TERMINAL_COLOR: Record<string, string> = {
  answered: "var(--ok)",
  voicemail_left: "var(--info)",
  forwarded_answered: "var(--ok)",
  forwarded_unanswered: "var(--warn)",
  rejected: "var(--danger)",
  disconnected: "var(--text-dim)",
  dropped: "var(--danger)",
};

const VALID_KEYS = new Set<string>([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "#",
  "fax",
  "no_input",
]);

function parsePress(raw: string): MenuInputKey[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => VALID_KEYS.has(s)) as MenuInputKey[];
}

export function SimulatorPanel({
  onTrace,
  onClose,
}: {
  onTrace: (trace: Trace | null) => void;
  onClose?: () => void;
}) {
  const exportFlow = useFlowStore((s) => s.exportFlow);
  const scenarios = useFlowStore((s) => s.scenarios);
  const periods = useFlowStore((s) => s.entity.time_periods ?? {});
  const setScenarios = (next: typeof scenarios) =>
    useFlowStore.setState({ scenarios: next });

  const availablePeriodNames = useMemo(() => {
    return ["always", ...Object.keys(periods).sort()];
  }, [periods]);

  const [caller, setCaller] = useState("+14155550101");
  const [callee, setCallee] = useState("18005551234");
  const [time, setTime] = useState("2026-05-17T12:00:00Z");
  const [activeMode, setActiveMode] = useState("");
  const [activePeriods, setActivePeriods] = useState<string[]>(["always", "business_hours"]);
  const [pressRaw, setPressRaw] = useState("");
  const [scenarioName, setScenarioName] = useState("");

  const [trace, setTrace] = useState<Trace | null>(null);

  const input = useMemo<SimulatorInput>(
    () => ({
      caller,
      callee,
      time,
      active_mode: activeMode || undefined,
      active_periods: activePeriods,
      press_sequence: parsePress(pressRaw),
    }),
    [caller, callee, time, activeMode, activePeriods, pressRaw],
  );

  const run = () => {
    const flow = exportFlow();
    const t = simulate(flow, input);
    setTrace(t);
    onTrace(t);
  };

  const saveScenario = () => {
    if (!scenarioName) return;
    setScenarios([
      ...scenarios.filter((s) => s.name !== scenarioName),
      {
        name: scenarioName,
        caller,
        callee,
        time,
        active_mode: activeMode || undefined,
        press_sequence: parsePress(pressRaw),
        answering_behavior: [],
        expected_terminal: trace?.terminal,
      },
    ]);
  };

  const loadScenario = (name: string) => {
    const s = scenarios.find((x) => x.name === name);
    if (!s) return;
    setCaller(s.caller);
    setCallee(s.callee);
    setTime(s.time);
    setActiveMode(s.active_mode ?? "");
    setPressRaw(s.press_sequence.join(" "));
    setScenarioName(s.name);
  };

  const runAll = () => {
    const flow = exportFlow();
    const results = scenarios.map((s) => {
      const t = simulate(flow, {
        caller: s.caller,
        callee: s.callee,
        time: s.time,
        active_mode: s.active_mode,
        press_sequence: s.press_sequence,
        active_periods: [],
        answering_behavior: s.answering_behavior,
      });
      return { name: s.name, terminal: t.terminal, expected: s.expected_terminal };
    });
    alert(
      results
        .map((r) => {
          const pass = !r.expected || r.expected === r.terminal;
          return `${pass ? "✓" : "✗"} ${r.name}: ${r.terminal}${r.expected ? ` (exp ${r.expected})` : ""}`;
        })
        .join("\n"),
    );
  };

  const appendPress = (key: string) => {
    setPressRaw((prev) => (prev ? `${prev} ${key}` : key));
  };

  const popPress = () => {
    setPressRaw((prev) => {
      const parts = prev.trim().split(/[,\s]+/);
      parts.pop();
      return parts.join(" ");
    });
  };

  const clearPress = () => setPressRaw("");

  return (
    <div className="simpanel">
      {onClose && (
        <button
          type="button"
          className="simpanel-close-btn"
          onClick={onClose}
          title="Collapse simulator"
          aria-label="Collapse simulator"
        >
          <X size={14} />
        </button>
      )}
      <div className="simpanel-grid">
        {/* LEFT COLUMN: Inputs */}
        <section className="simpanel-inputs">
          <h3 className="simpanel-section">Dialer Inputs</h3>
          <div className="inputs-grid">
            <label className="simpanel-field">
              <span>Caller</span>
              <input value={caller} onChange={(e) => setCaller(e.target.value)} />
            </label>
            <label className="simpanel-field">
              <span>Callee</span>
              <input value={callee} onChange={(e) => setCallee(e.target.value)} />
            </label>
            <label className="simpanel-field">
              <span>Time (ISO)</span>
              <input value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="simpanel-field">
              <span>Active mode</span>
              <input
                value={activeMode}
                onChange={(e) => setActiveMode(e.target.value)}
                placeholder="(none)"
              />
            </label>
          </div>

          <div className="simpanel-hr" />

          {/* Dynamic Active Period Chips */}
          <div className="simpanel-field-vertical">
            <span className="simpanel-field-label">Active periods</span>
            <div className="period-chips-grid">
              {availablePeriodNames.map((name) => {
                const active = activePeriods.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`period-chip${active ? " is-active" : ""}`}
                    onClick={() => {
                      if (active) {
                        setActivePeriods(activePeriods.filter((p) => p !== name));
                      } else {
                        setActivePeriods([...activePeriods, name]);
                      }
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="simpanel-hr" />

          <div className="simpanel-buttons">
            <button type="button" className="simpanel-btn-run" onClick={run}>
              <Play size={13} fill="currentColor" /> Run
            </button>
            <button
              type="button"
              className="simpanel-btn-clear"
              onClick={() => {
                setTrace(null);
                onTrace(null);
                setPressRaw("");
              }}
            >
              Clear
            </button>
          </div>
        </section>

        {/* DIALPAD COLUMN */}
        <section className="simpanel-dialpad">
          <h3 className="simpanel-section">DTMF Keypad</h3>
          <div className="simpanel-field-vertical">
            <span className="simpanel-field-label">Press sequence</span>
            <div className="press-sequence-display">
              <input
                value={pressRaw}
                readOnly
                placeholder="Click keypad..."
                className="press-sequence-input"
              />
              {pressRaw && (
                <button
                  type="button"
                  className="press-sequence-clear"
                  onClick={clearPress}
                  title="Clear sequence"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
            
            <div className="dtmf-keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className="dtmf-btn"
                  onClick={() => appendPress(k)}
                >
                  {k}
                </button>
              ))}
              <button
                key="no_input"
                type="button"
                className="dtmf-btn dtmf-btn-aux"
                onClick={() => appendPress("no_input")}
                title="No Input (Timeout)"
              >
                no-in
              </button>
              <button
                key="fax"
                type="button"
                className="dtmf-btn dtmf-btn-aux"
                onClick={() => appendPress("fax")}
                title="Fax Tone"
              >
                fax
              </button>
              <button
                key="pop"
                type="button"
                className="dtmf-btn dtmf-btn-back"
                onClick={popPress}
                disabled={!pressRaw}
                title="Backspace"
              >
                <Delete size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* MIDDLE COLUMN: Scenarios */}
        <section className="simpanel-scenarios">
          <h3 className="simpanel-section">Saved Scenarios ({scenarios.length})</h3>
          <div className="simpanel-scenario-controls">
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Scenario name..."
            />
            <button type="button" onClick={saveScenario} disabled={!scenarioName}>
              Save
            </button>
            <button type="button" onClick={runAll} disabled={scenarios.length === 0}>
              Run all
            </button>
          </div>
          <ul className="simpanel-scenario-list">
            {scenarios.map((s) => (
              <li key={s.name} className="scenario-item">
                <button type="button" onClick={() => loadScenario(s.name)}>
                  {s.name}
                </button>
                <small className="scenario-item-expected">{s.expected_terminal ?? "—"}</small>
              </li>
            ))}
            {scenarios.length === 0 && (
              <p className="no-scenarios-note">No scenarios saved yet.</p>
            )}
          </ul>
        </section>

        {/* RIGHT COLUMN: Physical Receipt Ledger Trace */}
        <section className="simpanel-trace">
          <h3 className="simpanel-section">Live Call Trace</h3>
          {!trace ? (
            <div className="simpanel-trace-empty">
              <FileText className="empty-icon" size={32} />
              <p className="shell-placeholder">Initiate a call simulation using the Run trigger to print the route ledger.</p>
            </div>
          ) : (
            <div className="simpanel-receipt-ticket">
              {/* Receipt Border Top (Zig-Zag Mock) */}
              <div className="receipt-border-decor" />
              
              <div className="receipt-inner">
                {/* Header */}
                <div className="receipt-ticket-header">
                  <span className="receipt-brand">TELECOM ROUTE LEDGER</span>
                  <span className="receipt-watermark">PRO FORMA</span>
                </div>

                {/* Meta details */}
                <div className="receipt-meta-grid">
                  <div className="receipt-meta-row">
                    <span className="receipt-meta-label">CALLER (ANI):</span>
                    <span className="receipt-meta-val font-mono">{caller}</span>
                  </div>
                  <div className="receipt-meta-row">
                    <span className="receipt-meta-label">CALLEE (DNIS):</span>
                    <span className="receipt-meta-val font-mono">{callee}</span>
                  </div>
                  <div className="receipt-meta-row">
                    <span className="receipt-meta-label">TIMESTAMP:</span>
                    <span className="receipt-meta-val font-mono">{time.replace("T", " ").replace("Z", "")}</span>
                  </div>
                  {activeMode && (
                    <div className="receipt-meta-row">
                      <span className="receipt-meta-label">PBX STATE MODE:</span>
                      <span className="receipt-meta-val font-mono">{activeMode}</span>
                    </div>
                  )}
                  {activePeriods.length > 0 && (
                    <div className="receipt-meta-row">
                      <span className="receipt-meta-label">ACTIVE SCHEDULE:</span>
                      <span className="receipt-meta-val font-mono">{activePeriods.join(", ")}</span>
                    </div>
                  )}
                </div>

                <div className="receipt-divider" />

                {/* Timeline */}
                <div className="receipt-timeline">
                  <div className="timeline-line-connector" />
                  {trace.steps.map((s, i) => {
                    const IconComponent = getNodeIcon(s.node_type as NodeKind);
                    return (
                      <div key={i} className="timeline-receipt-step">
                        <div className="timeline-bullet-node">
                          <IconComponent size={12} className="bullet-node-icon" />
                        </div>
                        <div className="timeline-receipt-content">
                          <div className="timeline-receipt-step-header font-mono">
                            <span className="timeline-node-kind">{s.node_type.replace(/_/g, " ").toUpperCase()}</span>
                            <span className="timeline-node-ms">+{s.elapsed_ms}ms</span>
                          </div>
                          <p className="timeline-node-msg">{s.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="receipt-divider" />

                {/* Additional Prompts & Side Effects */}
                {(trace.prompts.length > 0 || trace.side_effects.length > 0) && (
                  <>
                    <div className="receipt-sub-section font-mono">
                      {trace.prompts.length > 0 && (
                        <div className="receipt-sub-row">
                          <strong className="receipt-sub-label">PROMPTS PLAYED:</strong>
                          <span className="receipt-sub-list">{trace.prompts.join(" // ")}</span>
                        </div>
                      )}
                      {trace.side_effects.length > 0 && (
                        <div className="receipt-sub-row">
                          <strong className="receipt-sub-label">SYSTEM EFFECTS:</strong>
                          <div className="receipt-sub-effects">
                            {trace.side_effects.map((se, idx) => (
                              <div key={idx} className="effect-item">
                                » {se.kind.replace(/_/g, " ").toUpperCase()} ({se.detail})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="receipt-divider" />
                  </>
                )}

                {/* Outcomes Receipt Footer */}
                <div className="receipt-outcome-footer">
                  <span className="receipt-outcome-title font-heading">TERMINAL SEGMENT OUTCOME</span>
                  <div 
                    className="receipt-outcome-badge font-mono"
                    style={{ 
                      color: "var(--text-on-status)",
                      backgroundColor: TERMINAL_COLOR[trace.terminal] ?? "var(--text-dim)" 
                    }}
                  >
                    {trace.terminal.includes("answered") ? (
                      <CheckCircle2 size={13} className="badge-icon" />
                    ) : (
                      <AlertCircle size={13} className="badge-icon" />
                    )}
                    {trace.terminal.replace(/_/g, " ").toUpperCase()}
                    {trace.terminal_detail ? ` / ${trace.terminal_detail.toUpperCase()}` : ""}
                  </div>
                </div>
              </div>

              {/* Receipt Border Bottom */}
              <div className="receipt-border-decor-bottom" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
