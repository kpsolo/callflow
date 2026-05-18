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
| `.prettierrc.json` / `.gitignore` | Standard. |

## 2. App shell (`src/app/`)

Top-level UI composition.

| File | Role |
|---|---|
| `Shell.tsx` | Three-cluster top bar (entity switcher / save status / validation pill — `▶ Run simulator` — undo/redo group + overflow menu + presence), CSS-grid body (palette / canvas / resizer / inspector), bottom simulator drawer. |
| `Shell.css` | Layout + brand + sim button + undo group + help dl + presence slot. |
| `useKeyboardShortcuts.ts` | Global hook: `Ctrl+Z` undo, `Ctrl+Shift+Z` redo, `Ctrl+D` duplicate, `Del`/`Backspace` remove selected, all gated against editable focus targets. |
| `useResizable.ts` | Generic edge-aware resizer hook with `localStorage` persistence and min/max clamps. Currently consumed by the inspector divider; reusable. |
| `WelcomeBanner.tsx`, `WelcomeBanner.css` | Dismissible four-step tour, persists dismissal in `localStorage` (`cfs.welcome.dismissed.v1`). |
| `SaveStatus.tsx`, `SaveStatus.css` | Pill that reads `store.dirty` + `store.lastSavedAt`; ticks every 10s for the "Saved Xs ago" wording. |
| `OverflowMenu.tsx`, `OverflowMenu.css` | Generic `⋯` dropdown for secondary actions; click-away and Escape close. |
| `PresenceIndicator.tsx`, `PresenceIndicator.css` | Single-user avatar with hashed-palette colour; rename inline; localStorage-only today. Placeholder for multi-user presence. |

## 3. Schema (`src/schema/`)

Zod is the source of truth. TypeScript types are `z.infer<typeof X>` —
hand-writing types is avoided.

| File | Exports |
|---|---|
| `primitives.ts` | `PromptIdSchema`, `ExtensionNumberSchema`, `E164Schema`, `SipUriSchema`, `ActivePeriodSchema` (union of `"always"` and any named string), `EmailSchema`, `VoicemailEmailOptionSchema`, `VoicemailGreetingSchema`, `RingPolicySchema`, `AnsweringModeExtSchema` (8 values), `AnsweringModeAaSchema` (8 values), `IncomingCallModeSchema`, `MenuInputKeySchema` (`0-9 * # fax no_input`), `PositionSchema`. |
| `timePeriod.ts` | `TimePeriodSchema`, `TimePeriodListSchema`, `TimePeriodMapSchema`; pure evaluator `matchesPeriod`, `isAnyPeriodActive`; UX helpers `summarizePeriod`, `summarizeList`, `autoNamePeriod`, `uniqueName`. |
| `entity.ts` | `AutoAttendantEntitySchema` (id, did, name, directory, optional `time_periods`, optional `preferred_ivr_language`), `ExtensionEntitySchema` (id, extension, name, optional `time_periods`, optional `preferred_ivr_language`), `EntitySchema` discriminated union, `ExtensionDirectoryEntrySchema` (extension, name, published). |
| `nodeData.ts` | Per-kind data schemas: incoming/outgoing call, menu (`MenuRootDataSchema`, `MenuCustomDataSchema` — name + active_period + prompts + no_input + allow_direct_dial + interdigit_timeout_s + inactive_action_node_id + actions map + retry-loop fields), 11 action kinds, two answering modes, four forwarding kinds + `RingModeSchema` (sequential, simultaneous, random, percentage) + `ForwardRuleSchema` (with optional `percentage_weight` and `sip_proxy`) + advanced flags (`keep_original_cld`, `replace_caller_id_name`), `ScreeningRuleDataSchema`, voicemail, fax_mailbox, call_recording, condition (4), target (4), terminal. |
| `node.ts` | `NODE_KINDS` (39 kinds), `NodeKind` literal union, `FlowNodeSchema` as a Zod discriminated union over `type`, helper types `FlowNode`, `FlowNodeData`, `NodeOf<K>`. |
| `edge.ts` | `FlowEdgeSchema` (id, source, sourceHandle, target, targetHandle, optional label). |
| `scenario.ts` | `ScenarioSchema` (name, caller, callee, time, optional active_mode, press_sequence, answering_behavior, optional expected_terminal). |
| `flow.ts` | `SCHEMA_VERSION = "1.0"`, `FlowSchema` with version regex `^1\.\d+$`, `emptyFlow(entity)`. |
| `index.ts` | Re-exports everything. |
| `__tests__/flow.test.ts`, `__tests__/timePeriod.test.ts` | Round-trip, 2.x rejection, period evaluator, auto-naming. |

### Node kind census (39 kinds)

| Category | Kinds | Count |
|---|---|---|
| Entry | `incoming_call`, `outgoing_call` | 2 |
| Menu | `menu_root`, `menu_custom` | 2 |
| Action | `action_transfer`, `action_transfer_e164`, `action_prompt_extension`, `action_dial_direct`, `action_voicemail`, `action_dial_by_name`, `action_disconnect`, `action_disa`, `action_queue`, `action_goto_menu`, `action_nop` | 11 |
| Answering | `answering_mode_ext`, `answering_mode_aa` | 2 |
| Forwarding | `forward_follow_me`, `forward_advanced`, `forward_sip_uri`, `forward_simple` | 4 |
| Screening | `screening_rule` | 1 |
| Messaging | `voicemail`, `fax_mailbox` | 2 |
| Recording | `call_recording` | 1 |
| Condition | `cond_time`, `cond_caller`, `cond_callee`, `cond_mode` | 4 |
| Target | `target_extension`, `target_hunt_group_ref`, `target_external`, `target_sip_uri` | 4 |
| Terminal | `term_answered`, `term_voicemail_left`, `term_forwarded_answered`, `term_forwarded_unanswered`, `term_rejected`, `term_dropped` | 6 |

## 4. Node registry + view (`src/nodes/`)

| File | Role |
|---|---|
| `registry.ts` | `NodeTypeDef<K>` with: kind, category, label, shortLabel, color, description, inputs[], outputs[], defaultData factory, `paletteHidden`, `singletonPerEntity`, `primaryFor: EntityKind[]`. Exports `NODE_TYPES` (map), `NODE_TYPE_LIST`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `getNodeType<K>(kind)`. Per-kind colour constants. |
| `FlowNodeView.tsx` | Single generic React Flow custom node. Reads from registry; renders header (background color, text colour from `pickHeaderText`), START chip on `menu_root`, validation badge (error/warning) sourced from `useValidation()`, body summary from `summaries.tsx`, static handles, dynamic menu handles (per action key + `inactive` + `no_input` when configured). |
| `FlowNodeView.css` | Card / header / body / START chip / badge / handle styling. |
| `summaries.tsx` | Per-kind small-text body summaries. |
| `nodeTypes.ts` | Builds the `{ kind: FlowNodeView }` map React Flow consumes. |
| `contrast.ts` | `relativeLuminance(hex)`, `pickHeaderText(hex)` (picks whichever of `#fff` / `#11161f` has higher contrast ratio), `contrastRatio(a, b)`. |
| `__tests__/registry.test.ts` | Every kind has a registry entry; every defaultData parses through `FlowNodeSchema`; ROOT singleton; entry/terminal port shapes. |
| `__tests__/contrast.test.ts` | Header-text picks for action orange, condition yellow, menu purple, screening red; AA threshold sanity. |

## 5. State (`src/state/`)

Three stores, each tightly scoped.

| File | Role |
|---|---|
| `store.ts` | Main `FlowStore` (zustand with `temporal` middleware): entity, nodes, edges, scenarios, selectedNodeId, `loadCounter` (fits canvas on load), `dirty`, `lastSavedAt`. Mutating actions: `onNodesChange`, `onEdgesChange`, `onConnect`, `addNode`, `updateNodeData`, `removeNode`, `duplicateNode`, `removeEdge`, `setSelected`, `setEntity`, `loadFlow`, `exportFlow`, `clearFlow`, `replaceLayout`, `markSaved`. Dirty flag set on structural changes; cleared on `loadFlow` / `clearFlow` / `markSaved`. Temporal `partialize` skips `selectedNodeId` so undo doesn't shuffle selection. |
| `menuEdgeSync.ts` | Three pure helpers keeping `data.actions` and edges in sync: `projectMenuEdges`, `applyMenuConnectToActions`, `applyMenuEdgeRemovalToActions`. Edge IDs deterministic `menu_<src>_<key>`. |
| `traceStore.ts` | Holds the most recent simulator trace + a `visited_node_ids` set for canvas path-highlight. |
| `uiStore.ts` | Ephemeral cross-pane UI state: `hoveredMenuKey` (inspector→canvas highlight), `flashedMenuKey` (canvas→inspector flash, auto-clears after 700 ms). |
| `__tests__/menuEdgeSync.test.ts` | 7 tests: projection, replacement of prior menu edges, no-op on non-menu handles, prompt preservation, removal. |

## 6. Canvas (`src/canvas/`)

| File | Role |
|---|---|
| `Canvas.tsx` | React Flow wrapper. Hooks into store for nodes/edges/changes. Memoises edges through `styleEdges` (with extra emphasis on the edge matching `selected + hoveredMenuKey`). Right-click handlers (`onNodeContextMenu`, `onEdgeContextMenu`, `onPaneContextMenu`) emit `ContextMenu` state. `onEdgeMouseEnter` triggers `flashMenuKey`. Drag-drop from the palette (MIME `application/x-callflow-node-kind`) → `addNode` at flow-projected position. Auto-layout / Fit-view buttons. MiniMap with per-kind `nodeColor`. Hint pill that auto-dismisses each of three actions seen flags persisted in `localStorage`. |
| `Canvas.css` | Wrapper + actions + hint pill + minimap / controls overrides. |
| `ContextMenu.tsx`, `ContextMenu.css` | Generic absolute-positioned menu with viewport clamping, click-away + Escape dismiss. |
| `autoLayout.ts` | `layoutDagre(nodes, edges, "LR"|"TB")`. Uses `align: "UL"` and post-processes the result to pin `menu_root` to the smallest y so ROOT visually reads as the start. |
| `edgeStyle.ts` | `getEdgeStyle(edge)` returning `{ style, labelStyle, labelBgStyle, animated }`; per-digit colour palette; `styleEdges(edges)` for memoised batch application. |
| `__tests__/edgeStyle.test.ts` | Default grey, per-digit distinctness, inactive dashed warn, no_input / fax dotted, identity preservation. |

## 7. Palette (`src/palette/`)

| File | Role |
|---|---|
| `Palette.tsx` | Reads `entity.type` from the store; renders categories from `CATEGORY_ORDER`. Items whose `primaryFor` doesn't include the current entity are visually demoted (opacity + tooltip) but still draggable. Section header dims when no kind in it is primary. HTML5 drag source carries `kind` in `PALETTE_DRAG_MIME`. |
| `Palette.css` | Section / item / demote / drag-cursor styles. |

## 8. Inspector (`src/inspector/`)

| File | Role |
|---|---|
| `Inspector.tsx` | Dispatcher. Looks up the selected node, builds field list from `FIELDS[kind]`, renders header (color-chip type label + editable name + monospace id + Delete button). For node kinds whose fields declare a `tab`, renders a tab strip (General / Prompts / Actions / Errors) and filters to the active tab; otherwise renders flat. |
| `Inspector.css` | Header chip + name + id + fields layout + tab strip + actions-map / rules-list / action-row CSS. |
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
| `validate.ts` | Pure function over a parsed `Flow`. Rules:<br>• `root_missing` / `root_duplicate` / `root_name` (AA only)<br>• `menu_action_ref` / `menu_inactive_ref` / `menu_noinput_ref` — references must resolve<br>• `goto_menu_ref`<br>• `forward_rule_ref` — every rule target exists<br>• `no_entry` / `no_terminal` — soft warnings<br>• `forward_no_rules` — warning when a forwarding node has no enabled rules<br>• `voicemail_email_address` — error if `email_option != "none"` but no `email_address`<br>• `mode_missing_forward` — error if the extension answering mode uses Forward but no forwarding node exists<br>• `forward_unreachable` — warning when forwarding nodes exist but the answering mode doesn't use Forward (PortaOne MR129 docs) |
| `useValidation.ts` | Hook that runs `validate(exportFlow())` and re-runs whenever nodes/edges/entity change. |
| `IssuesPanel.tsx`, `IssuesPanel.css` | Issue list with severity badges; clicking an issue selects the corresponding node. Also exports `ValidationSummary` (compact `N issues` text). |
| `ValidationPill.tsx`, `ValidationPill.css` | Top-bar pill that opens the panel as a floating popover. Colours: green `is-ok`, amber `is-warn`, red `is-err`. |
| `__tests__/validate.test.ts` | 8 tests covering each rule. |

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

13 test files, **86 tests total**.

| File | Count |
|---|---|
| `schema/__tests__/flow.test.ts` | 4 |
| `schema/__tests__/timePeriod.test.ts` | 7 |
| `nodes/__tests__/registry.test.ts` | 4 |
| `nodes/__tests__/contrast.test.ts` | 4 |
| `canvas/__tests__/edgeStyle.test.ts` | 6 |
| `inspector/__tests__/*` | (none — covered by store and simulator tests) |
| `state/__tests__/menuEdgeSync.test.ts` | 7 |
| `validation/__tests__/validate.test.ts` | 8 |
| `io/__tests__/exportImport.test.ts` | 4 |
| `simulator/__tests__/extension.test.ts` | 8 |
| `simulator/__tests__/autoAttendant.test.ts` | 19 |
| `simulator/__tests__/forwarding.test.ts` | 9 |
| `fixtures/__tests__/acmeHqMultiDept.test.ts` | 3 |
| `fixtures/__tests__/splitFanIn.test.ts` | 3 |

## 14. Build artefacts

`npm run build` after vendor chunk split:

| Chunk | Min size | Gzip |
|---|---|---|
| `reactflow` | 290 kB | 94 kB |
| `dagre` | 89 kB | 31 kB |
| `zod` | 56 kB | 13 kB |
| `index` (app) | 128 kB | 35 kB |
| `zustand` | 3 kB | 1 kB |
| `react` | 0.03 kB | (hoisted by Vite vendor pipeline) |
| CSS | 33 kB | 6 kB |

No `chunkSizeWarningLimit` warnings.

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
