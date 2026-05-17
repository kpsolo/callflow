import { useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  NODE_TYPE_LIST,
  type NodeCategory,
  type NodeTypeDef,
} from "@/nodes/registry";
import { PALETTE_DRAG_MIME } from "@/canvas/Canvas";
import "./Palette.css";

export function Palette() {
  const grouped = useMemo(() => {
    const out: Record<NodeCategory, NodeTypeDef[]> = {} as Record<NodeCategory, NodeTypeDef[]>;
    for (const cat of CATEGORY_ORDER) out[cat] = [];
    for (const def of NODE_TYPE_LIST) {
      if (def.paletteHidden) continue;
      out[def.category].push(def);
    }
    return out;
  }, []);

  return (
    <div className="palette">
      <h2 className="shell-section-title">Palette</h2>
      {CATEGORY_ORDER.map((cat) => (
        <Section key={cat} category={cat} defs={grouped[cat]} />
      ))}
    </div>
  );
}

function Section({ category, defs }: { category: NodeCategory; defs: NodeTypeDef[] }) {
  const [open, setOpen] = useState(true);
  if (defs.length === 0) return null;
  return (
    <section className="palette-section">
      <button
        type="button"
        className="palette-section-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{CATEGORY_LABELS[category]}</span>
        <span className="palette-section-count">{defs.length}</span>
      </button>
      {open && (
        <ul className="palette-list">
          {defs.map((def) => (
            <PaletteItem key={def.kind} def={def} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PaletteItem({ def }: { def: NodeTypeDef }) {
  return (
    <li>
      <button
        type="button"
        className="palette-item"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PALETTE_DRAG_MIME, def.kind);
          e.dataTransfer.effectAllowed = "move";
        }}
        title={def.description}
      >
        <span className="palette-item-color" style={{ background: def.color }} aria-hidden />
        <span className="palette-item-label">{def.label}</span>
      </button>
    </li>
  );
}
