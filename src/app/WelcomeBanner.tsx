import { useState } from "react";
import "./WelcomeBanner.css";

const STORAGE_KEY = "cfs.welcome.dismissed.v1";

export function WelcomeBanner() {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1",
  );
  if (dismissed) return null;

  return (
    <aside className="welcome" role="note" aria-label="Welcome">
      <div className="welcome-content">
        <strong>Welcome to Call Flow Studio.</strong>
        <ol>
          <li>
            <b>Load a fixture</b> from the top-bar dropdown — try{" "}
            <em>Acme HQ — multi-dept + holidays</em>.
          </li>
          <li>
            <b>Drag nodes</b> from the left palette onto the canvas.{" "}
            <b>Right-click</b> a node, edge, or empty canvas for actions.
          </li>
          <li>
            <b>Click a node</b> to edit it in the right-hand Inspector.
          </li>
          <li>
            Open the <b>▲ Simulator</b> drawer at the bottom, set inputs, and Run to see the
            traced path light up on the canvas.
          </li>
        </ol>
      </div>
      <button
        type="button"
        className="welcome-dismiss"
        onClick={() => {
          window.localStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss welcome"
      >
        Got it
      </button>
    </aside>
  );
}
