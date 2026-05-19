# Call Flow Studio — Project Specification

A precise description of every module in the codebase. Each section names
the files, states the public surface, and explains how the module fits with
the others. Numbers (file counts, kind counts, etc.) are verified against
the working tree at the time of writing.

## 1. Top level

| File | Purpose |
|---|---|
| `package.json` | npm metadata, scripts: `dev`, `build` (tsc -b + vite build), `test` (vitest run), `test:watch`, `lint`, `format`. |
| `vite.config.ts` | Vite + React plugin, path alias `@` → `src`, vitest config (jsdom, globals, setup at `src/test/setup.ts`), `manualChunks` splitting `reactflow`, `dagre`, `zod`, `zustand`+`zundo`, and `react`+`react-dom` into named chunks. |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | TS project references; strict mode, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, path alias for `@/*`. |
| `eslint.config.js` | Flat config, `tseslint` + react hooks + react refresh. |
| `index.html` | Vite entry; mounts `/src/main.tsx`. |
| `src/index.css` | Global tokens + base resets. Defines the `--bg / --bg-elev / --bg-elev-2 / --border / --text / --text-dim / --accent / --accent-dim / --danger / --warn / --info / --ok / --dot-grid` palette plus flow-node geometry vars (`--fn-node-*`). Sets `color-scheme: light dark` and provides a `@media (prefers-color-scheme: light)` override that swaps the palette for light values. Until the host portal drives theme selection explicitly, the embed follows the browser/OS preference. |
| `.prettierrc.json` / `.gitignore` | Standard. |

## 2. App shell (`src/app/`)

Top-level UI composition.

| File | Role |
|---|---|
| `Shell.tsx` | Top bar laid out as three clusters: LEFT — brand + fixture select + **Open simulator** (outline button) + (hidden) LockIndicator; CENTER — empty placeholder; RIGHT — `StatusPill` (issues-only) + `SaveButton` (mocked) + undo/redo icon group + `OverflowMenu` + `PresenceStack` + `PresenceIndicator`. CSS-grid body (palette / canvas / resizer / inspector), bottom simulator drawer. First-mount `useEffect` calls `restoreAutosave()` to bring back the last-saved entity from localStorage. Fixture dropdown's `onChange` calls `restoreSavedForEntity(id)` first (falls back to `loadFlow(fixture)`) and clears temporal history so Ctrl+Z can't time-travel across fixture switches. Overflow menu includes the **Show node IDs** view toggle (wired to `uiStore.showNodeIds`). |
| `Shell.css` | Layout + brand + outline sim button (`shell-sim-btn`) + icon button (`shell-icon-btn`) + undo group + help dl + presence slot. |
| `useKeyboardShortcuts.ts` | Global hook: `Ctrl+Z` undo, `Ctrl+Shift+Z` redo, `Ctrl+D` duplicate, `Del`/`Backspace` remove selected, all gated against editable focus targets. |
| `useResizable.ts` | Generic edge-aware resizer hook with `localStorage` persistence and min/max clamps. Currently consumed by the inspector divider; reusable. |
| `useAutosave.ts` | Per-entity localStorage persistence. `restoreAutosave()` loads the last-saved entity on first mount; `persistFlow()` writes the current flow under its `entity.id` and stamps `lastEntityId`; `restoreSavedForEntity(id)` is the dropdown's "prefer saved over pristine fixture" call; `hasSaveForEntity(id)`, `clearAutosave()` are convenience. Storage key `callflow.autosave.v2`; transparent migration from the v1 single-flow key. No continuous subscription — every write happens because the user clicked Save. |
| `SaveButton.tsx`, `SaveButton.css` | Mocked Save affordance. Three states: dirty + idle (accent-filled "Save"), clean + idle (green outline "Saved" with `<Check/>` icon), saving (`<Loader2/>` spinner, disabled). Click → 400 ms fake-latency → `persistFlow()` + `markSaved()`. Swap `persistFlow()` for an API call once the backend lands. |
| `StatusPill.tsx`, `StatusPill.css` | Validation-issues pill. Renders only when there are errors or warnings; clicking opens `IssuesPanel` as a floating popover. Save state lives in `SaveButton`, not here. |
| `WelcomeBanner.tsx`, `WelcomeBanner.css` | Dismissible four-step tour, persists dismissal in `localStorage` (`cfs.welcome.dismissed.v1`). |
| `OverflowMenu.tsx`, `OverflowMenu.css` | Generic `⋯` dropdown for secondary actions; click-away and Escape close. `OverflowItem` supports an optional `checked` boolean which renders the item as a `menuitemcheckbox` with a ✓ glyph (used for view toggles like "Show node IDs"). |
| `PresenceIndicator.tsx`, `PresenceIndicator.css`, `PresenceStack.tsx` | Single-user avatar with hashed-palette colour; rename inline; localStorage-only today. The `LockIndicator` is intentionally not mounted in the topbar until real-time collab lands. |
| `__tests__/persistFlow.test.ts` | 8 tests covering per-entity round-trip: write/read, restore-by-id, position preservation across fixture switches, multi-entity coexistence, v1→v2 migration, last-saved restore on mount. |

## 3. Schema (`src/schema/`)

Zod is the source of truth. TypeScript types are `z.infer<typeof X>` —
hand-writing types is avoided.

| File | Exports |
|---|---|
| `primitives.ts` | `PromptIdSchema`, `ExtensionNumberSchema`, `E164Schema`, `SipUriSchema`, `ActivePeriodSchema` (union of `"always"` and any named string), `EmailSchema`, `VoicemailEmailOptionSchema`, `VoicemailGreetingSchema`, `RingPolicySchema`, `AnsweringModeExtSchema` (8 values), `AnsweringModeAaSchema` (8 values), `IncomingCallModeSchema`, `MenuInputKeySchema` (`0-9 * # fax no_input`), `PositionSchema`. |
| `timePeriod.ts` | `TimePeriodSchema`, `TimePeriodListSchema`, `TimePeriodMapSchema`; pure evaluator `matchesPeriod`, `isAnyPeriodActive`; UX helpers `summarizePeriod`, `summarizeList`, `autoNamePeriod`, `uniqueName`. |
| `entity.ts` | `AutoAttendantEntitySchema` (id, did, name, directory, optional `time_periods`, optional `preferred_ivr_language`), `ExtensionEntitySchema` (id, extension, name, optional `time_periods`, optional `preferred_ivr_language`), `EntitySchema` discriminated union, `ExtensionDirectoryEntrySchema` (extension, name, published). |
| `nodeData.ts` | Per-kind data schemas: incoming/outgoing call, menu (`MenuRootDataSchema`, `MenuCustomDataSchema` — name + active_period + prompts + no_input + allow_direct_dial + interdigit_timeout_s + inactive_action_node_id + actions map + retry-loop fields), 10 action kinds (no `action_goto_menu`; a menu action's `target_node_id` may point directly at another menu), two answering modes, four forwarding kinds + `RingModeSchema` (sequential, simultaneous, random, percentage) + `ForwardRuleSchema` (with optional `percentage_weight` and `sip_proxy`) + advanced flags (`keep_original_cld`, `replace_caller_id_name`), `ScreeningRuleDataSchema`, voicemail, fax_mailbox, `CallRecordingDataSchema` (MR129: mode automatic/on_demand + allow_manual_start_stop + start/stop DTMF + dual announce prompts + auto_record_incoming/redirected + format wav/mp3 + send_to_email + private_to_owner + enable_transcription, with legacy `announce`/`announce_prompt` fields kept for back-compat), condition (4), target (4), terminal. |
| `node.ts` | `NODE_KINDS` (38 kinds), `NodeKind` literal union, `FlowNodeSchema` as a Zod discriminated union over `type`, helper types `FlowNode`, `FlowNodeData`, `NodeOf<K>`. |
| `edge.ts` | `FlowEdgeSchema` (id, source, sourceHandle, target, targetHandle, optional label). |
| `scenario.ts` | `ScenarioSchema` (name, caller, callee, time, optional active_mode, press_sequence, answering_behavior, optional expected_terminal). |
| `flow.ts` | `SCHEMA_VERSION = "1.0"`, `FlowSchema` with version regex `^1\.\d+$`, `emptyFlow(entity)`. |
| `index.ts` | Re-exports everything. |
| `__tests__/flow.test.ts`, `__tests__/timePeriod.test.ts` | Round-trip, 2.x rejection, period evaluator, auto-naming. |

### Node kind census (38 kinds)

| Category | Kinds | Count |
|---|---|---|
| Entry | `incoming_call`, `outgoing_call` | 2 |
| Menu | `menu_root`, `menu_custom` | 2 |
| Action | `action_transfer`, `action_prompt_extension`, `action_dial_direct`, `action_voicemail`, `action_dial_by_name`, `action_disconnect`, `action_disa`, `action_queue`, `action_nop` | 9 |
| Answering | `answering_mode_ext`, `answering_mode_aa` | 2 |
| Forwarding | `forward_follow_me`, `forward_advanced`, `forward_sip_uri`, `forward_simple` | 4 |
| Screening | `screening_rule` | 1 |
| Messaging | `voicemail`, `fax_mailbox` | 2 |
| Recording | `call_recording` | 1 |
| Condition | `cond_time`, `cond_caller`, `cond_callee`, `cond_mode` | 4 |
| Target | `target_extension`, `target_hunt_group_ref`, `target_external`, `target_sip_uri` | 4 |
| Terminal | `term_answered`, `term_voicemail_left`, `term_forwarded_answered`, `term_forwarded_unanswered`, `term_rejected`, `term_dropped` | 6 |

`action_transfer` carries an internal `mode: "extension" | "e164"`
discriminator inside its data — both shapes route through the same
node kind. `action_goto_menu` was retired (2026-05-19): a menu
action's `target_node_id` may point directly at another `menu_root` /
`menu_custom` node, and `runNode` dispatches to `runMenu` automatically.

## 4. Node registry + view (`src/nodes/`)

| File | Role |
|---|---|
| `registry.ts` | `NodeTypeDef<K>` with: kind, category, label, shortLabel, color, description, inputs[], outputs[], defaultData factory, `paletteHidden`, `singletonPerEntity`, `primaryFor: EntityKind[]`. Exports `NODE_TYPES` (map), `NODE_TYPE_LIST`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `getNodeType<K>(kind)`. Per-kind colour constants. |
| `FlowNodeView.tsx` | Single generic React Flow custom node. Reads from registry; renders the header — two layouts: when `getNodeHeadline(kind, data)` returns a string the header switches to a stacked layout (small uppercase type label above a bold headline); otherwise the single-line type label is used. Lucide icon from `icons.tsx` in the header. START chip on `menu_root`, validation badge (error/warning) sourced from `useValidation()`, body summary from `summaries.tsx`, comment-count badge, hover trash button, drop-target highlight when `uiStore.dropTargetNodeId === id`. Static handles, dynamic menu handles (per action key + `inactive` + `no_input` when configured). Output handles take their colour and shape from `handleVisuals.ts` and render as "menu option pills" — labelled rounded pills with a small coloured dot positioned at the right edge. |
| `FlowNodeView.css` | Card / header (single-line + headlined variants) / body / START chip / badge / pill output / handle shape variants (`fn-handle-shape--circle | --square | --diamond | --ring`) / trash button / drop-target outline. |
| `headline.ts` | `getNodeHeadline(kind, data): string | null` — maps a node kind to its user-meaningful identifier (menu name, target extension, screening rule name, forwarding target, queue name, e164 transfer number, hunt-group label) or `null` when the type label is the only identifier. Drives the headlined header layout in `FlowNodeView`. |
| `handleVisuals.ts` | Single source of truth for output-handle visuals. `getHandleColor(optionId)` and `getHandleShape(optionId)` return the colour and shape (`"circle" | "square" | "diamond" | "ring"`) per the vocabulary: digit handles → coloured circles; `fax` → blue square; `no_input` → amber diamond; `inactive` → orange ring; everything else → grey circle. `handleShapeClass(optionId)` returns the matching CSS class. Imported by both `FlowNodeView` (for the dot) and `canvas/edgeStyle.ts` (which reuses the same semantic groups). |
| `icons.tsx` | Maps every `NodeKind` to a Lucide-React icon component (`PhoneIncoming`, `Voicemail`, `Menu`, etc.). Used in the node header, palette items, and the inspector type chip. |
| `summaries.tsx` | Per-kind small-text body summaries. |
| `nodeTypes.ts` | Builds the `{ kind: FlowNodeView }` map React Flow consumes. |
| `contrast.ts` | `relativeLuminance(hex)`, `pickHeaderText(hex)` (picks whichever of `#fff` / `#11161f` has higher contrast ratio), `contrastRatio(a, b)`. |
| `__tests__/registry.test.ts` | Every kind has a registry entry; every defaultData parses through `FlowNodeSchema`; ROOT singleton; entry/terminal port shapes. |
| `__tests__/contrast.test.ts` | Header-text picks for action orange, condition yellow, menu purple, screening red; AA threshold sanity. |

## 5. State (`src/state/`)

Three stores, each tightly scoped.

| File | Role |
|---|---|
| `store.ts` | Main `FlowStore` (zustand with `temporal` middleware): entity, nodes, edges, scenarios, selectedNodeId, `loadCounter` (fits canvas on load), `dirty`, `lastSavedAt`. Mutating actions: `onNodesChange`, `onEdgesChange`, `onConnect`, `addNode`, `addNodeConnectedTo`, `updateNodeData`, `removeNode`, `duplicateNode`, `removeEdge`, `setSelected`, `setEntity`, `loadFlow`, `exportFlow`, `clearFlow`, `replaceLayout`, `markSaved`, `mergeIdenticalTerminals` (groups terminal / leaf nodes by `(kind, JSON.stringify(data))`, keeps an id-sorted canonical per group, rewires inbound edges, de-dupes resulting tuples — returns the count of duplicates removed). Dirty flag set on structural changes; cleared on `loadFlow` / `clearFlow` / `markSaved`. Temporal `partialize` skips `selectedNodeId` so undo doesn't shuffle selection. |
| `menuEdgeSync.ts` | Three pure helpers keeping `data.actions` and edges in sync: `projectMenuEdges`, `applyMenuConnectToActions`, `applyMenuEdgeRemovalToActions`. Edge IDs deterministic `menu_<src>_<key>`. |
| `traceStore.ts` | Holds the most recent simulator trace + a `visited_node_ids` set for canvas path-highlight. |
| `uiStore.ts` | Ephemeral cross-pane UI state: `hoveredMenuKey` (inspector→canvas highlight), `flashedMenuKey` (canvas→inspector flash, auto-clears after 700 ms), `dropTargetNodeId` (the node a palette drag is currently hovering — drives a highlight outline), `connectingFromNodeId` (set while a connection drag is in flight from a node handle), `pendingMenuPick` (queued menu-key picker after dropping a node onto a menu). Persisted via `localStorage`: `showNodeIds` (off by default, `callflow.ui.showNodeIds`), `miniMapCollapsed` (default `true`, `callflow.ui.miniMapCollapsed`), `recentNodeKinds` (MRU list capped at 5, `callflow.ui.recentNodeKinds`). |
| `__tests__/menuEdgeSync.test.ts` | 7 tests: projection, replacement of prior menu edges, no-op on non-menu handles, prompt preservation, removal. |
| `__tests__/mergeIdenticalTerminals.test.ts` | 4 tests: basic collapse-and-rewire, no-op when nothing matches, refusal to merge process kinds, edge de-dupe. |

## 6. Canvas (`src/canvas/`)

| File | Role |
|---|---|
| `Canvas.tsx` | React Flow wrapper. Hooks into store for nodes/edges/changes. Memoises edges through `styleEdges(edges, nodes)` (with extra emphasis on the edge matching `selected + hoveredMenuKey`). Registers `edgeTypes={{ flow: FlowEdge }}`. Right-click handlers (`onNodeContextMenu`, `onEdgeContextMenu`, `onPaneContextMenu`) emit `ContextMenu` state; the pane menu includes Auto-layout, Fit-view, quick-add-here entries, **Merge identical terminals**, and Clear flow. `onEdgeMouseEnter` triggers `flashMenuKey`. Drag-drop from the palette (MIME `application/x-callflow-node-kind`) → `addNode` or `addNodeConnectedTo` (when the drop lands on an existing node, with a `MenuKeyPicker` follow-up for menu-source drops). Records each successful drop into `uiStore.recentNodeKinds`. MiniMap collapse toggle (icon-button shows when collapsed; expanded MiniMap has an `×` overlay; persisted via `uiStore.miniMapCollapsed`). Hint pill that auto-dismisses each of three "actions seen" flags persisted in `localStorage`. |
| `Canvas.css` | Wrapper + actions + hint pill + minimap / controls overrides + minimap toggle button + minimap-collapse `×` overlay. |
| `ContextMenu.tsx`, `ContextMenu.css` | Generic absolute-positioned menu with viewport clamping, click-away + Escape dismiss. |
| `MenuKeyPicker.tsx`, `MenuKeyPicker.css` | Floating popover that asks the user which menu key (0-9, *, #, fax, no_input, inactive) a newly-dropped node should bind to when the drop target is a menu source. |
| `autoLayout.ts` | `layoutDagre(nodes, edges, "LR"|"TB")`. Uses `align: "UL"` and post-processes the result to pin `menu_root` to the smallest y so ROOT visually reads as the start. |
| `edgeStyle.ts` | `getEdgeStyle(edge)` returning `{ style, labelStyle, labelBgStyle, animated }`; per-digit colour palette aligned with `nodes/handleVisuals.ts`; `styleEdges(edges, nodes?)` for memoised batch application — when `nodes` is provided it dashes edges that originate from `cond_time` or from a menu with `active_period !== "always"`, and stamps `data.siblingIndex` / `data.siblingCount` so `FlowEdge` can fan out labels along the path. Also writes a `labelBgStyle` with `fill: var(--bg)` plus an edge-colour 1px border so labels punch out of the dot grid in either theme. |
| `FlowEdge.tsx` | Custom edge type registered as `flow`. Identical to React Flow's default bezier edge except for label positioning: when `data.siblingCount > 1`, the label is placed at `t = (i+1)/(n+1)` along the (source, target) segment so sibling labels stagger instead of stacking at the midpoint. Uses `getBezierPath` for the stroke and `EdgeText` for the label so the styling from `styleEdges` carries through unchanged. |
| `__tests__/edgeStyle.test.ts` | 9 tests: default grey, per-digit distinctness, inactive dashed warn, no_input / fax dotted, identity preservation, plus time-conditional dashing (cond_time source, non-always menu source, and the negative "always menu" case). |

## 7. Palette (`src/palette/`)

| File | Role |
|---|---|
| `Palette.tsx` | Reads `entity.type` from the store; renders a **search box** at top (`Ctrl/Cmd+K` focuses, `Esc` clears) that filters across `label + description + kind` and renders results flat with category sub-labels. When search is empty: a pinned **"Recently used"** section at top (sourced from `uiStore.recentNodeKinds`, capped at 5, filtered against the registry so stale entries don't render), followed by the regular collapsible category sections. Items whose `primaryFor` doesn't include the current entity are visually demoted (opacity + a concrete "Designed for an Auto Attendant — drop it here only if you know what you're doing" tooltip) but still draggable. Section header dims when no kind in it is primary. While a connection is being dragged from a node handle (`uiStore.connectingFromNodeId`), palette items become valid drop targets — releasing on one creates a new connected node of that kind. HTML5 drag source carries `kind` in `PALETTE_DRAG_MIME`. |
| `Palette.css` | Section / item / demote / drag-cursor styles + search input + recently-used pinned section + connect-armed hover affordance. |

## 8. Inspector (`src/inspector/`)

| File | Role |
|---|---|
| `Inspector.tsx` | Dispatcher. Accepts an optional `onEditEntity` callback (forwarded from `Shell`). When nothing is selected, delegates to `EntityInspector`. When a node is selected: looks up the selected node, builds field list from `FIELDS[kind]`, renders header (color-chip type label + editable name + Delete button; the monospace node-id chip is opt-in via `uiStore.showNodeIds`, which is toggled from the Shell overflow menu). The chip exposes the category colour as the `--chip-color` CSS custom property so the stylesheet can derive a contrast-safe variant per theme. For node kinds whose fields declare a `tab`, renders a tab strip (General / Prompts / Actions / Errors) and filters to the active tab; otherwise renders flat. |
| `EntityInspector.tsx` | Right-pane "nothing selected" view. Surfaces entity-level facts the canvas can't show by itself: type chip + entity name, DID or extension, node + edge counts, scenario count, validation summary (green ✓ when clean, otherwise red/amber error/warning counts), save status (`Saved Xs ago` / `Unsaved changes` / `—`), and an **Edit…** button that calls `onEditEntity` to open `EntitySettingsModal`. |
| `Inspector.css` | Header chip + name + id + fields layout + tab strip + actions-map / rules-list / action-row CSS. In light mode the solid category-coloured type chip would drop below WCAG AA on darker hues (e.g. menu purple), so a `@media (prefers-color-scheme: light)` block uses `color-mix` to render it as a soft tinted pill (light wash background + saturated hue text). |
| `fields.ts` | `FieldDef[]` per kind: `key`, `label`, `type` (`text`, `number`, `toggle`, `select`, `email`, `actions-map`, `rules-list`, `active-period`, `readonly`), optional `path` (dotted), `options`, `placeholder`, `min`/`max`, `tab` for menus. |
| `paths.ts` | `getAtPath` / `setAtPath` for dotted keys (e.g. `no_input.timeout_s`). |
| `MenuActionsEditor.tsx` | Two-line rows per input key: line 1 = target select + speaker icon for `play_before_action` + remove; line 2 = `<kind label> → <resolved target>`. Reads target options from the store and derives a "resolved" pointer (target_node_id, target_menu_node_id, mailbox_node_id, number, uri, extension). Hover row → `uiStore.setHoveredMenuKey`. |
| `ForwardRulesEditor.tsx` | Ordered list with up/down, enable/disable, target picker, ActivePeriodPicker for `time_check`, timeout, SIP proxy, and (only when `ring_mode === "percentage"`) per-rule weight. |
| `ActivePeriodPicker.tsx` | Combobox of `"always"` + every named period defined on the entity + a fallback "(not defined)" option, plus "Edit periods…" that opens `TimePeriodsModal`. Italic summary chip shows the resolved definition. |
| `TimePeriodEditor.tsx` | Edits one composite period: HH:MM time range pickers with overnight support, day-of-week toggle chips (weekday / weekend quick links), month chips, comma-separated days-of-month and years with range syntax (`1-7`). |
| `TimePeriodsModal.tsx` | Manage all named periods for the entity. Quick-start buttons for Business hours / Weekends / Empty seed sensible sub-periods and auto-derive the name; typing into the rename input locks the name. List shows summaries; per-period detail panel allows adding more sub-periods (OR), each editable. |
| `EntitySettingsModal.tsx` | Edit entity name, DID / extension, preferred IVR language (12-language dropdown + custom-code text field), directory entries with `published` toggle (AA only). |

## 9. Validation (`src/validation/`)

| File | Role |
|---|---|
| `validate.ts` | Pure function over a parsed `Flow`. Rules:<br>• `root_missing` / `root_duplicate` / `root_name` (AA only)<br>• `menu_action_ref` / `menu_inactive_ref` / `menu_noinput_ref` — references must resolve<br>• `forward_rule_ref` — every rule target exists<br>• `no_entry` / `no_terminal` — soft warnings<br>• `forward_no_rules` — warning when a forwarding node has no enabled rules<br>• `voicemail_email_address` — error if `email_option != "none"` but no `email_address`<br>• `mode_missing_forward` — error if the extension answering mode uses Forward but no forwarding node exists<br>• `forward_unreachable` — warning when forwarding nodes exist but the answering mode doesn't use Forward (PortaOne MR129 docs) |
| `useValidation.ts` | Hook that runs `validate(exportFlow())` and re-runs whenever nodes/edges/entity change. |
| `IssuesPanel.tsx`, `IssuesPanel.css` | Issue list with severity badges; clicking an issue selects the corresponding node. Also exports `ValidationSummary` (compact `N issues` text). |
| `__tests__/validate.test.ts` | 10 tests covering each rule. |

The top-bar validation pill is `app/StatusPill.tsx` (only renders
when there's at least one error or warning); save state lives in
`app/SaveButton.tsx`. The legacy `ValidationPill.tsx` and
`SaveStatus.tsx` files were removed in the topbar reshuffle.

## 10. Simulator (`src/simulator/`)

Pure TS — no DOM, no React, no `Date.now()`, no `Math.random()`.

| File | Role |
|---|---|
| `types.ts` | `SimulatorInput` (caller, callee, time, active_mode, press_sequence, answering_behavior, active_periods), `Trace` (steps, terminal, terminal_detail, prompts, side_effects, visited_edge_ids), `TraceStep`, `TerminalCode`, `SideEffect`, `SimulatorOptions`. |
| `engine.ts` | `simulate(flow, input, opts?)` — the main entry. Internal `Ctx` carries: nodesById, edgesBySource, trace, elapsed_ms, stepLimit (default 200), pressIndex, introPlayed, menuStack. Dispatcher routes on `entity.type`. |
| `SimulatorPanel.tsx`, `SimulatorPanel.css` | Bottom drawer UI: input form (caller, callee, time, active_mode, press_sequence text), Run button, scenarios list (save / load / run-all), trace viewer (steps with elapsed_ms, prompts list, side-effects list, terminal badge). |
| `__tests__/extension.test.ts` | 8 tests for §13.1: reject, ring_only answered, never_answer drops, voicemail_only with email side-effect, ring_then_voicemail fallthrough, screening match precedence, first-match-wins ordering, determinism. |
| `__tests__/autoAttendant.test.ts` | 19 tests for §13.2 including retry-loop, recovery, dial-by-name (single match, no match, announce_extensions), max_digits clamp, ROOT-with-time-interval, action_nop. |
| `__tests__/forwarding.test.ts` | 9 tests covering sequential, simultaneous, random (determinism), percentage (200-call distribution), CANCEL trace, inactive-rule skipping. |
| `__tests__/helpers.ts` | `mkExtFlow`, `mkAaFlow`, `mkNode<K>`, `resetIds` for ergonomic test fixtures. |

## 11. Import / Export (`src/io/`)

| File | Role |
|---|---|
| `exportImport.ts` | `serialize(flow) → string`, `parseAndValidate(raw) → { ok, flow?, errors?, warning? }`, `downloadJson(flow)` (triggers browser download). Schema-version gate: 1.x accepted (warning if minor differs), 2.x rejected. |
| `ImportDialog.tsx`, `ImportDialog.css` | Modal with file picker and textarea paste. Shows preview (`entity type · id · counts`) and warnings before applying. |
| `__tests__/exportImport.test.ts` | 4 tests: round-trip, invalid JSON, 2.x rejection, field-level Zod errors. |

## 12. Fixtures (`src/fixtures/`)

| File | Role |
|---|---|
| `acmeHqMultiDept.ts` | 45-node Acme HQ AA on +18005557890. 5 departments, holiday menu, hunt-group refs, external emergency line, fax mailbox, recording. Pre-loads four named time periods (business_hours, after_hours, weekend, holidays). 9 saved scenarios. |
| `acme3DeptAa.ts` | Simpler 3-dept AA — keeps the original PRD §11.3-style example loadable for quick demos. |
| `ext401Screening.ts` | Extension 401 with VIP + after-hours screening, ring_then_voicemail answering mode, recording attached to the answered leg. |
| `index.ts` | `FIXTURES: { label, flow }[]`, used by the top-bar dropdown. |
| `inferEdges.ts` | Pure: walks node data references and emits `FlowEdge[]` so the canvas mirrors the simulator's traversal. Handles menu actions, inactive_action, no_input fallback, action transfers, forwarding rules, answering-mode pointers. |
| `splitFanIn.ts` | Pure: clones terminal-style nodes (`voicemail`, `fax_mailbox`, `action_disconnect`, all `term_*`) when more than 2 inbound edges. Deterministic IDs: `<original>__forMenu_<sourceId>_<sourceHandle?>`. |
| `__tests__/acmeHqMultiDept.test.ts` | Schema round-trip, validator clean, every scenario's expected_terminal matches the simulator. |
| `__tests__/splitFanIn.test.ts` | At-threshold no-op, > 2 inbound duplicates, deterministic re-runs. |

## 13. Tests at a glance

17 test files, **124 tests total**.

| File | Count |
|---|---|
| `schema/__tests__/flow.test.ts` | 4 |
| `schema/__tests__/timePeriod.test.ts` | 7 |
| `nodes/__tests__/registry.test.ts` | 4 |
| `nodes/__tests__/contrast.test.ts` | 4 |
| `canvas/__tests__/edgeStyle.test.ts` | 9 |
| `state/__tests__/menuEdgeSync.test.ts` | 7 |
| `state/__tests__/mergeIdenticalTerminals.test.ts` | 4 |
| `validation/__tests__/validate.test.ts` | 10 |
| `io/__tests__/exportImport.test.ts` | 4 |
| `app/__tests__/persistFlow.test.ts` | 8 |
| `simulator/__tests__/extension.test.ts` | 8 |
| `simulator/__tests__/autoAttendant.test.ts` | 19 |
| `simulator/__tests__/forwarding.test.ts` | 9 |
| `simulator/__tests__/callRecording.test.ts` | 8 |
| `fixtures/__tests__/acmeHqMultiDept.test.ts` | 3 |
| `fixtures/__tests__/splitFanIn.test.ts` | 3 |
| `api/__tests__/localStorageClient.test.ts` | 13 |

## 14. Build artefacts

`npm run build` after vendor chunk split:

| Chunk | Min size | Gzip |
|---|---|---|
| `reactflow` | 290 kB | 94 kB |
| `dagre` | 89 kB | 31 kB |
| `zod` | 56 kB | 13 kB |
| `index` (app) | ~196 kB | ~52 kB |
| `zustand` | 3 kB | 1 kB |
| `react` | 0.03 kB | (hoisted by Vite vendor pipeline) |
| CSS | ~48 kB | ~9 kB |

The app bundle grew from the 128 kB baseline after adding the
lucide-react icon set used throughout the canvas, palette, inspector,
and topbar. No `chunkSizeWarningLimit` warnings.

## 15. Conventions

- **Zod first.** Add a schema before adding code that produces or consumes
  the shape. TS types are inferred.
- **Pure modules over framework code.** Anything not strictly UI lives in
  `src/{simulator,validation,fixtures,state/menuEdgeSync,nodes/contrast,
  canvas/{autoLayout,edgeStyle}}` — pure functions, unit-tested without
  React. UI shells consume them.
- **Determinism.** No `Date.now()`, no `Math.random()` in simulator,
  fixtures, or sync helpers. Random/percentage forwarding seeds off
  `FNV-1a(caller + callee + time)`. Time periods evaluate against
  wall-clock components extracted from the input ISO string.
- **CSS variables, not hex literals**, in component CSS. Palette colours
  on nodes are an exception (set inline from the registry).
- **Stable IDs.** `splitFanIn` clones use deterministic suffixes; menu-edge
  sync uses `menu_<src>_<key>`. Re-running these helpers should be
  idempotent on stable inputs.
- **`.optional()` over `.default()` on Zod schemas added late.** `.default()`
  yields a required field on the `z.infer` output type, which breaks
  pre-existing fixture object literals. Use `.optional()` and provide
  fallbacks at the use site (e.g. `data.max_input_errors ?? 3`).
