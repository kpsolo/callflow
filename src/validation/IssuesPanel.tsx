import { useValidation } from "./useValidation";
import { useFlowStore } from "@/state/store";
import "./IssuesPanel.css";

const SEV_LABEL: Record<string, string> = {
  error: "Error",
  warning: "Warn",
  info: "Info",
};

export function IssuesPanel() {
  const issues = useValidation();
  const setSelected = useFlowStore((s) => s.setSelected);

  if (issues.length === 0) {
    return (
      <div className="issues-empty" role="status">
        <span className="issues-ok-dot" /> No issues
      </div>
    );
  }

  return (
    <ul className="issues-list">
      {issues.map((i, idx) => (
        <li key={idx} className={`issues-row issues-row-${i.severity}`}>
          <button
            type="button"
            onClick={() => i.node_id && setSelected(i.node_id)}
            disabled={!i.node_id}
            title={i.node_id ?? "(flow-level)"}
          >
            <span className="issues-sev">{SEV_LABEL[i.severity]}</span>
            <span className="issues-msg">{i.message}</span>
            <small className="issues-code">{i.code}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ValidationSummary() {
  const issues = useValidation();
  const err = issues.filter((i) => i.severity === "error").length;
  const warn = issues.filter((i) => i.severity === "warning").length;
  if (err === 0 && warn === 0) return <span className="vs vs-ok">✓ No issues</span>;
  return (
    <span className="vs">
      {err > 0 && <span className="vs-err">{err} error{err > 1 ? "s" : ""}</span>}
      {err > 0 && warn > 0 && " · "}
      {warn > 0 && <span className="vs-warn">{warn} warning{warn > 1 ? "s" : ""}</span>}
    </span>
  );
}
