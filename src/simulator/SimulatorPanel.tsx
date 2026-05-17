import { useMemo, useState } from "react";
import { useFlowStore } from "@/state/store";
import { simulate } from "./engine";
import type { SimulatorInput, Trace } from "./types";
import type { MenuInputKey } from "@/schema";
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
}: {
  onTrace: (trace: Trace | null) => void;
}) {
  const exportFlow = useFlowStore((s) => s.exportFlow);
  const scenarios = useFlowStore((s) => s.scenarios);
  const setScenarios = (next: typeof scenarios) =>
    useFlowStore.setState({ scenarios: next });

  const [caller, setCaller] = useState("+14155550101");
  const [callee, setCallee] = useState("18005551234");
  const [time, setTime] = useState("2026-05-17T12:00:00Z");
  const [activeMode, setActiveMode] = useState("");
  const [activePeriods, setActivePeriods] = useState("business_hours");
  const [pressRaw, setPressRaw] = useState("");
  const [scenarioName, setScenarioName] = useState("");

  const [trace, setTrace] = useState<Trace | null>(null);

  const input = useMemo<SimulatorInput>(
    () => ({
      caller,
      callee,
      time,
      active_mode: activeMode || undefined,
      active_periods: activePeriods
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
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

  return (
    <div className="simpanel">
      <div className="simpanel-grid">
        <section className="simpanel-inputs">
          <h3 className="simpanel-section">Inputs</h3>
          <Field label="Caller">
            <input value={caller} onChange={(e) => setCaller(e.target.value)} />
          </Field>
          <Field label="Callee">
            <input value={callee} onChange={(e) => setCallee(e.target.value)} />
          </Field>
          <Field label="Time (ISO)">
            <input value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Active mode">
            <input
              value={activeMode}
              onChange={(e) => setActiveMode(e.target.value)}
              placeholder="(none)"
            />
          </Field>
          <Field label="Active periods">
            <input
              value={activePeriods}
              onChange={(e) => setActivePeriods(e.target.value)}
              placeholder="comma-separated"
            />
          </Field>
          <Field label="Press sequence">
            <input
              value={pressRaw}
              onChange={(e) => setPressRaw(e.target.value)}
              placeholder="e.g. 1 2 *"
            />
          </Field>
          <div className="simpanel-buttons">
            <button type="button" onClick={run}>
              Run
            </button>
            <button
              type="button"
              onClick={() => {
                setTrace(null);
                onTrace(null);
              }}
            >
              Clear
            </button>
          </div>
        </section>

        <section className="simpanel-scenarios">
          <h3 className="simpanel-section">Scenarios ({scenarios.length})</h3>
          <div className="simpanel-scenario-controls">
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="scenario name"
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
              <li key={s.name}>
                <button type="button" onClick={() => loadScenario(s.name)}>
                  {s.name}
                </button>
                <small>{s.expected_terminal ?? "—"}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="simpanel-trace">
          <h3 className="simpanel-section">
            Trace
            {trace && (
              <span
                className="simpanel-terminal"
                style={{
                  background: TERMINAL_COLOR[trace.terminal] ?? "var(--text-dim)",
                }}
              >
                {trace.terminal}
                {trace.terminal_detail ? ` — ${trace.terminal_detail}` : ""}
              </span>
            )}
          </h3>
          {!trace ? (
            <p className="shell-placeholder">Run a simulation to see the trace.</p>
          ) : (
            <>
              <ol className="simpanel-steps">
                {trace.steps.map((s, i) => (
                  <li key={i}>
                    <span className="simpanel-step-time">{s.elapsed_ms}ms</span>
                    <span className="simpanel-step-type">{s.node_type}</span>
                    <span className="simpanel-step-msg">{s.message}</span>
                  </li>
                ))}
              </ol>
              {trace.prompts.length > 0 && (
                <div className="simpanel-sub">
                  <strong>Prompts played:</strong> {trace.prompts.join(" · ")}
                </div>
              )}
              {trace.side_effects.length > 0 && (
                <div className="simpanel-sub">
                  <strong>Side-effects:</strong>{" "}
                  {trace.side_effects.map((s, i) => (
                    <span key={i}>
                      {s.kind} ({s.detail})
                      {i < trace.side_effects.length - 1 ? "; " : ""}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="simpanel-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
