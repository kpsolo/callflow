import { Sparkles, MousePointerClick, Play } from "lucide-react";
import { useFlowStore } from "@/state/store";
import { FIXTURES } from "@/fixtures";
import "./WelcomeBanner.css";

/**
 * Empty-state-first welcome: only renders when the canvas has zero nodes,
 * so it never overlaps real work, and it disappears automatically the moment
 * the user drops their first node. Two CTAs replace the prior step-list:
 * load a template (high-ROI for first runs) or import existing JSON.
 *
 * The right-click / inspector / simulator discoverability hints have been
 * promoted to the topbar (Help icon) and the canvas Run bar respectively,
 * so the empty state stays focused on "start here".
 */
export function WelcomeBanner() {
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const loadFlow = useFlowStore((s) => s.loadFlow);
  if (nodeCount > 0) return null;

  const firstFixture = FIXTURES[0];

  return (
    <aside className="welcome" role="note" aria-label="Get started">
      <div className="welcome-icon" aria-hidden>
        <Sparkles size={20} />
      </div>
      <div className="welcome-content">
        <strong>This canvas is empty.</strong>
        <p>
          Drag a node from the left palette to get started — or load a sample
          to see how a complete flow looks.
        </p>
        <div className="welcome-cta-row">
          {firstFixture && (
            <button
              type="button"
              className="welcome-cta welcome-cta--primary"
              onClick={() => {
                loadFlow(firstFixture.flow);
                useFlowStore.temporal.getState().clear();
              }}
            >
              <Sparkles size={13} aria-hidden /> Load a sample flow
            </button>
          )}
          <span className="welcome-cta-hint">
            <MousePointerClick size={13} aria-hidden />
            Or drag a node from the left
          </span>
          <span className="welcome-cta-hint">
            <Play size={13} aria-hidden />
            Press Run (top-right) to simulate
          </span>
        </div>
      </div>
    </aside>
  );
}
