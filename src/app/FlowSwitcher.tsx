import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronsUpDown,
  Check,
  Copy,
  FilePlus,
  Hash,
  Phone,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Flow } from "@/schema";
import "./FlowSwitcher.css";

export type NewFlowKind = "auto_attendant" | "extension";

/** Discriminated union describing how the new flow should be created. */
export type NewFlowStrategy =
  | { kind: "blank"; entityKind: NewFlowKind }
  | { kind: "clone"; sourceFlowId: string };

export interface FlowSwitcherOption {
  /** Stable id used as the option's value. */
  id: string;
  /** Source fixture or "custom" flow. */
  flow: Flow;
  /** Display label (fixture label, or fallback "Custom flow"). */
  label: string;
  /** True when this option matches the currently loaded flow. */
  current: boolean;
}

export interface FlowSwitcherCurrent {
  /** Entity-type eyebrow displayed above the name (e.g. "AUTO ATTENDANT"). */
  eyebrow: string;
  /** Entity name displayed as the primary identity. */
  name: string;
  /** Optional DID/extension shown next to the name. */
  number?: string;
  /** Whether the loaded entity is an Auto Attendant (drives the icon). */
  isAA: boolean;
}

export interface FlowSwitcherProps {
  options: FlowSwitcherOption[];
  current: FlowSwitcherCurrent;
  onSelect: (option: FlowSwitcherOption) => void;
  /**
   * Fired when the user confirms a "new flow" creation strategy:
   * either start from a blank canvas (with the picked entity kind), or
   * clone an existing flow's nodes + edges + scenarios under a fresh
   * entity stub. When omitted, the create footer is hidden.
   */
  onCreateNew?: (strategy: NewFlowStrategy) => void;
}

/** Two-step popover state. */
type View =
  | { kind: "list" }
  | { kind: "pick-type" }
  | { kind: "pick-source" };

/** Lowercase helper for substring matching. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD");
}

/**
 * Custom flow switcher with quick search — designed to scale to hundreds of
 * flows. The list is filtered live by the search input on entity name, DID,
 * and extension. Create actions are always visible at the bottom so users
 * can fall back to "New …" when no match exists.
 *
 * Keyboard model (combobox-style with aria-activedescendant):
 *  - Trigger: Enter / Space / ↓ opens; ↑ opens at the last item.
 *  - Input has focus while menu is open; typing filters.
 *  - ↑ / ↓ / Home / End move the highlighted option without losing input focus.
 *  - Enter activates the highlighted option; Esc clears query, second Esc
 *    closes; Tab closes (don't trap).
 */
export function FlowSwitcher({
  options,
  current,
  onSelect,
  onCreateNew,
}: FlowSwitcherProps) {
  const TriggerIcon = current.isAA ? Phone : Hash;

  /** Footer actions that switch the popover into a sub-view. The strategy
   *  itself isn't dispatched yet — sub-views ask one more question first. */
  const createActions = useMemo(
    () =>
      onCreateNew
        ? [
            {
              id: "from-scratch",
              label: "From scratch",
              hint: "Start with an empty canvas",
              icon: FilePlus,
              next: "pick-type" as const,
            },
            {
              id: "from-existing",
              label: "Use other flow",
              hint: "Copy nodes and structure from an existing flow",
              icon: Copy,
              next: "pick-source" as const,
            },
          ]
        : [],
    [onCreateNew],
  );

  const [view, setView] = useState<View>({ kind: "list" });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const inputId = `${baseId}-input`;

  // Filter live. We index against label + DID/extension so users can search
  // "401", "+1800", or fragments of the fixture name interchangeably.
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((opt) => {
      const ent = opt.flow.entity;
      const num = ent.type === "auto_attendant" ? ent.did : ent.extension;
      return (
        norm(opt.label).includes(q) ||
        norm(ent.name).includes(q) ||
        norm(num).includes(q)
      );
    });
  }, [options, query]);

  // Total navigable items in the *list view* = filtered flows + create
  // actions. Sub-views render their own focusable elements so keyboard
  // moves are handled by the browser's natural tab order there.
  const totalItems = filtered.length + createActions.length;

  const currentIndex = useMemo(
    () => Math.max(0, filtered.findIndex((o) => o.current)),
    [filtered],
  );

  const openMenu = (initialHighlight?: number) => {
    setHighlight(initialHighlight ?? currentIndex);
    setView({ kind: "list" });
    setOpen(true);
  };

  const closeMenu = (returnFocus = true) => {
    setOpen(false);
    setQuery("");
    setView({ kind: "list" });
    if (returnFocus) triggerRef.current?.focus();
  };

  const backToList = () => {
    setView({ kind: "list" });
    setQuery("");
    setHighlight(0);
    // Defer focus to the next paint so the input is mounted.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Click outside → close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeMenu(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the search input when the menu opens; users can start typing
  // immediately to filter.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Reset highlight when filter results change so we never point at a
  // row that no longer exists.
  useEffect(() => {
    setHighlight((h) => (h >= totalItems ? Math.max(0, totalItems - 1) : h));
  }, [totalItems]);

  // Keep the highlighted row scrolled into view as ↑/↓ moves past the
  // visible window — important when the list is long.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const activate = (idx: number) => {
    if (idx < filtered.length) {
      onSelect(filtered[idx]);
      closeMenu();
      return;
    }
    const create = createActions[idx - filtered.length];
    if (!create) return;
    // Don't dispatch yet — transition into the sub-view that asks the
    // remaining question (which entity type? which source flow?).
    setView({ kind: create.next });
    setQuery("");
    setHighlight(0);
  };

  const dispatchCreate = (strategy: NewFlowStrategy) => {
    onCreateNew?.(strategy);
    closeMenu();
  };

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openMenu();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(totalItems - 1);
    }
  };

  // All keyboard navigation runs through the search input — focus never
  // leaves it while the menu is open, so typing works without an extra
  // click and arrow keys still move the highlight.
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (totalItems > 0) setHighlight((h) => (h + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalItems > 0)
        setHighlight((h) => (h - 1 + totalItems) % totalItems);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(Math.max(0, totalItems - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (totalItems > 0) activate(highlight);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Esc precedence: clear query → back to list → close.
      if (query) setQuery("");
      else if (view.kind !== "list") backToList();
      else closeMenu();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const currentLabel = options.find((o) => o.current)?.label ?? current.name;
  const activeId =
    totalItems > 0 ? `${baseId}-opt-${highlight}` : undefined;

  return (
    <div className="flow-switcher" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="flow-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Switch flow (current: ${currentLabel})`}
        title="Switch flow"
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <span
          className={
            "flow-switcher-trigger-icon" +
            (current.isAA ? " is-aa" : " is-ext")
          }
          aria-hidden
        >
          <TriggerIcon size={14} />
        </span>
        <span className="flow-switcher-trigger-body">
          <span className="flow-switcher-trigger-eyebrow">{current.eyebrow}</span>
          <span className="flow-switcher-trigger-row">
            <span className="flow-switcher-trigger-name">{current.name}</span>
            {current.number && (
              <span className="flow-switcher-trigger-num">· {current.number}</span>
            )}
          </span>
        </span>
        <ChevronsUpDown
          size={14}
          aria-hidden
          className="flow-switcher-trigger-chevron"
        />
      </button>

      {open && (
        <div className="flow-switcher-panel">
          {view.kind === "list" ? (
            <ListView
              listId={listId}
              listRef={listRef}
              inputRef={inputRef}
              inputId={inputId}
              activeId={activeId}
              query={query}
              setQuery={setQuery}
              onInputKey={onInputKey}
              setHighlight={setHighlight}
              highlight={highlight}
              filtered={filtered}
              optionsCount={options.length}
              baseId={baseId}
              activate={activate}
              createActions={createActions}
            />
          ) : view.kind === "pick-type" ? (
            <PickTypeView onBack={backToList} onPick={(entityKind) =>
              dispatchCreate({ kind: "blank", entityKind })
            } />
          ) : (
            <PickSourceView
              options={options}
              onBack={backToList}
              onPick={(sourceFlowId) =>
                dispatchCreate({ kind: "clone", sourceFlowId })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

interface ListViewProps {
  listId: string;
  listRef: React.MutableRefObject<HTMLUListElement | null>;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  inputId: string;
  activeId: string | undefined;
  query: string;
  setQuery: (q: string) => void;
  onInputKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setHighlight: React.Dispatch<React.SetStateAction<number>>;
  highlight: number;
  filtered: FlowSwitcherOption[];
  optionsCount: number;
  baseId: string;
  activate: (idx: number) => void;
  createActions: Array<{
    id: string;
    label: string;
    hint: string;
    icon: LucideIcon;
    next: "pick-type" | "pick-source";
  }>;
}

/** Default list view — search + scrolling inventory + pinned create footer. */
function ListView({
  listId,
  listRef,
  inputRef,
  inputId,
  activeId,
  query,
  setQuery,
  onInputKey,
  setHighlight,
  highlight,
  filtered,
  optionsCount,
  baseId,
  activate,
  createActions,
}: ListViewProps) {
  return (
    <>
      <div className="flow-switcher-search">
        <Search
          size={14}
          aria-hidden
          className="flow-switcher-search-icon"
        />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeId}
          className="flow-switcher-search-input"
          placeholder={`Search ${optionsCount} flow${optionsCount === 1 ? "" : "s"}…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onInputKey}
        />
        {query && (
          <button
            type="button"
            className="flow-switcher-search-clear"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            title="Clear (Esc)"
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Available flows"
        className="flow-switcher-menu"
      >
        {filtered.length === 0 && (
          <li className="flow-switcher-empty" aria-live="polite">
            No flows match “{query}”.
          </li>
        )}

        {filtered.map((opt, idx) => {
          const ent = opt.flow.entity;
          const isAA = ent.type === "auto_attendant";
          const value =
            ent.type === "auto_attendant" ? ent.did : ent.extension;
          const Icon = isAA ? Phone : Hash;
          return (
            <li
              key={opt.id}
              id={`${baseId}-opt-${idx}`}
              role="option"
              aria-selected={opt.current}
              data-idx={idx}
              className={
                "flow-switcher-option" +
                (opt.current ? " is-current" : "") +
                (idx === highlight ? " is-highlight" : "")
              }
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activate(idx)}
            >
              <span
                className={
                  "flow-switcher-option-icon" +
                  (isAA ? " is-aa" : " is-ext")
                }
                aria-hidden
              >
                <Icon size={14} />
              </span>
              <span className="flow-switcher-option-body">
                <span className="flow-switcher-option-label">
                  {opt.label}
                </span>
                <span className="flow-switcher-option-value">
                  {isAA ? "DID" : "Ext"} · {value}
                </span>
              </span>
              {opt.current && (
                <Check
                  size={14}
                  aria-hidden
                  className="flow-switcher-option-check"
                />
              )}
            </li>
          );
        })}
      </ul>

      {createActions.length > 0 && (
        <ul
          role="group"
          aria-label="Create new flow"
          className="flow-switcher-footer"
        >
          {createActions.map((action, i) => {
            const idx = filtered.length + i;
            const ActionIcon = action.icon;
            return (
              <li
                key={action.id}
                id={`${baseId}-opt-${idx}`}
                role="option"
                data-idx={idx}
                className={
                  "flow-switcher-option flow-switcher-option--create" +
                  (idx === highlight ? " is-highlight" : "")
                }
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => activate(idx)}
              >
                <span
                  className="flow-switcher-option-icon flow-switcher-option-icon--neutral"
                  aria-hidden
                >
                  <ActionIcon size={14} />
                </span>
                <span className="flow-switcher-option-body">
                  <span className="flow-switcher-option-label">
                    {action.label}
                  </span>
                  <span className="flow-switcher-option-value">
                    {action.hint}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Sub-view shown after the user picks "From scratch". Asks AA vs Ext. */
function PickTypeView({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (kind: NewFlowKind) => void;
}) {
  return (
    <div className="flow-switcher-substep">
      <SubstepHeader title="From scratch" subtitle="Pick an entity type" onBack={onBack} />
      <ul className="flow-switcher-cards">
        <li>
          <button
            type="button"
            className="flow-switcher-card"
            onClick={() => onPick("auto_attendant")}
            autoFocus
          >
            <span className="flow-switcher-option-icon is-aa" aria-hidden>
              <Phone size={16} />
            </span>
            <span className="flow-switcher-card-body">
              <span className="flow-switcher-card-title">Auto Attendant</span>
              <span className="flow-switcher-card-desc">
                Greeting, menu, and routing for an inbound DID
              </span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="flow-switcher-card"
            onClick={() => onPick("extension")}
          >
            <span className="flow-switcher-option-icon is-ext" aria-hidden>
              <Hash size={16} />
            </span>
            <span className="flow-switcher-card-body">
              <span className="flow-switcher-card-title">Extension</span>
              <span className="flow-switcher-card-desc">
                Personal or shared extension with screening and forwarding
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}

/** Sub-view shown after the user picks "Use other flow". Lets them browse
 *  and pick a source flow whose structure becomes the starting point. */
function PickSourceView({
  options,
  onBack,
  onPick,
}: {
  options: FlowSwitcherOption[];
  onBack: () => void;
  onPick: (sourceFlowId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((opt) => {
      const ent = opt.flow.entity;
      const num = ent.type === "auto_attendant" ? ent.did : ent.extension;
      return (
        norm(opt.label).includes(q) ||
        norm(ent.name).includes(q) ||
        norm(num).includes(q)
      );
    });
  }, [options, query]);

  return (
    <div className="flow-switcher-substep">
      <SubstepHeader
        title="Use other flow"
        subtitle="Pick a flow to copy"
        onBack={onBack}
      />
      <div className="flow-switcher-search flow-switcher-search--inner">
        <Search size={14} aria-hidden className="flow-switcher-search-icon" />
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          spellCheck={false}
          className="flow-switcher-search-input"
          placeholder="Search flows to copy from…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (query) setQuery("");
              else onBack();
            }
          }}
        />
      </div>
      <ul className="flow-switcher-menu" role="listbox" aria-label="Source flows">
        {filtered.length === 0 && (
          <li className="flow-switcher-empty" aria-live="polite">
            No flows match “{query}”.
          </li>
        )}
        {filtered.map((opt) => {
          const ent = opt.flow.entity;
          const isAA = ent.type === "auto_attendant";
          const value =
            ent.type === "auto_attendant" ? ent.did : ent.extension;
          const Icon = isAA ? Phone : Hash;
          return (
            <li
              key={opt.id}
              role="option"
              className="flow-switcher-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(opt.id)}
            >
              <span
                className={
                  "flow-switcher-option-icon" + (isAA ? " is-aa" : " is-ext")
                }
                aria-hidden
              >
                <Icon size={14} />
              </span>
              <span className="flow-switcher-option-body">
                <span className="flow-switcher-option-label">{opt.label}</span>
                <span className="flow-switcher-option-value">
                  {isAA ? "DID" : "Ext"} · {value}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Shared header for sub-views: back arrow + title + dim subtitle. */
function SubstepHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="flow-switcher-substep-header">
      <button
        type="button"
        className="flow-switcher-back"
        onClick={onBack}
        aria-label="Back to flow list"
        title="Back (Esc)"
      >
        <ArrowLeft size={14} aria-hidden />
      </button>
      <div className="flow-switcher-substep-title-stack">
        <span className="flow-switcher-substep-title">{title}</span>
        <span className="flow-switcher-substep-subtitle">{subtitle}</span>
      </div>
    </div>
  );
}

