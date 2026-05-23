import { useEffect, useMemo, useRef, useState } from "react";
import { useFlowStore } from "@/state/store";
import { useUiStore } from "@/state/uiStore";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  NODE_TYPE_LIST,
  getNodeType,
  type EntityKind,
  type NodeCategory,
  type NodeTypeDef,
} from "@/nodes/registry";
import { getNodeIcon } from "@/nodes/icons";
import { PALETTE_DRAG_MIME } from "@/canvas/Canvas";
import "./Palette.css";

const ENTITY_LABEL: Record<EntityKind, string> = {
  auto_attendant: "an Auto Attendant",
  extension: "an Extension",
};

function isPrimaryFor(def: NodeTypeDef, entity: EntityKind): boolean {
  return !def.primaryFor || def.primaryFor.includes(entity);
}

/** Tooltip text — concrete about the constraint, not just "mainly used for". */
function paletteTooltip(def: NodeTypeDef, entity: EntityKind): string {
  if (isPrimaryFor(def, entity) || !def.primaryFor) return def.description;
  const targets = def.primaryFor.map((e) => ENTITY_LABEL[e]).join(" or ");
  return `${def.description}\n\nDesigned for ${targets} — drop it here only if you know what you're doing.`;
}

export function Palette() {
  const entityType = useFlowStore((s) => s.entity.type);
  const connecting = useUiStore((s) => s.connectingFromNodeId !== null);
  const recentKinds = useUiStore((s) => s.recentNodeKinds);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K focuses the search. Mirrors the discoverability story in other
  // command-bar-ish tools so the muscle memory transfers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grouped = useMemo(() => {
    const out: Record<NodeCategory, NodeTypeDef[]> = {} as Record<NodeCategory, NodeTypeDef[]>;
    for (const cat of CATEGORY_ORDER) out[cat] = [];
    for (const def of NODE_TYPE_LIST) {
      if (def.paletteHidden) continue;
      out[def.category].push(def);
    }
    return out;
  }, []);

  const q = query.trim().toLowerCase();
  const searchActive = q.length > 0;
  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    return NODE_TYPE_LIST.filter(
      (d) =>
        !d.paletteHidden &&
        (d.label.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.kind.toLowerCase().includes(q)),
    );
  }, [q, searchActive]);

  // Resolve the recent-kinds id list against the registry. Filter out any
  // kinds that no longer exist (e.g. after a schema migration) or are flagged
  // paletteHidden so the section stays valid even if the persisted list is stale.
  const recentDefs = useMemo<NodeTypeDef[]>(() => {
    const out: NodeTypeDef[] = [];
    for (const kind of recentKinds) {
      const def = getNodeType(kind);
      if (!def || def.paletteHidden) continue;
      out.push(def);
    }
    return out;
  }, [recentKinds]);

  return (
    <div className={"palette" + (connecting ? " palette--connect-armed" : "")}>
      <div className="palette-search">
        <input
          ref={inputRef}
          type="search"
          className="palette-search-input"
          placeholder="Search nodes…  (Ctrl+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Search palette"
        />
      </div>

      {searchActive ? (
        <div className="palette-search-results">
          {searchResults.length === 0 ? (
            <p className="shell-placeholder">No matches for "{query}".</p>
          ) : (
            <ul className="palette-list">
              {searchResults.map((def) => (
                <PaletteItem
                  key={def.kind}
                  def={def}
                  entityType={entityType}
                  showCategory
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {recentDefs.length > 0 && (
            <section className="palette-section palette-section--recent">
              <div className="palette-section-header palette-section-header--static">
                <span>Recently used</span>
                <span className="palette-section-count">{recentDefs.length}</span>
              </div>
              <ul className="palette-list">
                {recentDefs.map((def) => (
                  <PaletteItem key={`recent-${def.kind}`} def={def} entityType={entityType} />
                ))}
              </ul>
            </section>
          )}
          {CATEGORY_ORDER.map((cat) => (
            <Section key={cat} category={cat} defs={grouped[cat]} entityType={entityType} />
          ))}
        </>
      )}
    </div>
  );
}

function Section({
  category,
  defs,
  entityType,
}: {
  category: NodeCategory;
  defs: NodeTypeDef[];
  entityType: EntityKind;
}) {
  const [open, setOpen] = useState(true);
  if (defs.length === 0) return null;

  // A category is fully off-pattern when none of its visible kinds are primary
  // for the current entity. We collapse it by default and add an explanatory hint.
  const anyPrimary = defs.some((d) => isPrimaryFor(d, entityType));

  return (
    <section className={"palette-section" + (anyPrimary ? "" : " is-offpattern")}>
      <button
        type="button"
        className="palette-section-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={anyPrimary ? undefined : `Mainly used for other entity types`}
      >
        <span>{CATEGORY_LABELS[category]}</span>
        <span className="palette-section-count">{defs.length}</span>
      </button>
      {open && (
        <ul className="palette-list">
          {defs.map((def) => (
            <PaletteItem key={def.kind} def={def} entityType={entityType} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PaletteItem({
  def,
  entityType,
  showCategory,
}: {
  def: NodeTypeDef;
  entityType: EntityKind;
  showCategory?: boolean;
}) {
  const primary = isPrimaryFor(def, entityType);
  const Icon = getNodeIcon(def.kind);
  // Off-pattern items used to be dimmed to 50% opacity, which reads as
  // "disabled". Show a small tag instead — same signal, full readability.
  const offPatternFor =
    !primary && def.primaryFor
      ? def.primaryFor
          .map((e) => (e === "auto_attendant" ? "AA" : "Ext"))
          .join("/")
      : null;
  return (
    <li>
      <button
        type="button"
        className={"palette-item" + (primary ? "" : " is-demoted")}
        draggable
        data-palette-kind={def.kind}
        onDragStart={(e) => {
          e.dataTransfer.setData(PALETTE_DRAG_MIME, def.kind);
          e.dataTransfer.effectAllowed = "move";
        }}
        title={paletteTooltip(def, entityType)}
      >
        <span className="palette-item-color" style={{ background: def.color }} aria-hidden />
        <Icon size={14} style={{ color: def.color }} className="palette-item-icon" />
        <span className="palette-item-label">
          {def.label}
          {showCategory && (
            <span className="palette-item-cat">{CATEGORY_LABELS[def.category]}</span>
          )}
        </span>
        {offPatternFor && (
          <span className="palette-item-tag" title="Mainly used for other entity types">
            {offPatternFor}
          </span>
        )}
      </button>
    </li>
  );
}
