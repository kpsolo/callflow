# Call Flow Studio — Project History

A chronological record of decisions, shipped work, and intentional deferrals,
written from the session that produced this codebase. Test/build numbers are
quoted as verified at the time of the change.

## 0. Origin

The working directory `C:\Work\cloudpbx\callflow` initially contained four spec
documents and nothing else:

- `docs/Call_Flow_Studio_PRD.docx` — internal PRD (v1.0 draft, 2026-05-17)
- `docs/Auto attendant.docx` — PortaSwitch AA execution semantics
- `docs/Summary features .docx` — PBX feature catalogue
- `docs/supported services.pdf` — SIP / PortaSIP / PortaBilling call lifecycle

Goal: build a single-page visual editor that replaces PortaSwitch's
per-screen call-routing UIs (Auto Attendant menus, Follow-me lists, Hunt
Groups, Call Screening, Voicemail) with one drag-and-drop canvas plus a
deterministic simulator and JSON import/export.

## 1. Plan and stack decisions

After audit of the four spec docs, three orthogonal choices were made:

| Question | Answer |
|---|---|
| Initial scope | **MVP slice** — Canvas, Extension & AA editing, JSON I/O, basic deterministic simulator. Hunt Groups, templates, audit history, real-time collab, AI assist, full Call Queue flows, and mobile editing all deferred. |
| Stack | **React 18 + React Flow 11 + TypeScript 5.6 + Vite 5**. Zod for schemas (single source of truth), Zustand + zundo for state with undo/redo, dagre for auto-layout, react-hook-form for inspector forms, Vitest for tests. |
| Persistence | **Frontend-only SPA**. Save = JSON download, Load = file picker. No backend, no PortaSwitch API integration this slice. |

The full plan was written to
`C:\Users\kpsol\.claude\plans\analyze-docs-and-create-immutable-narwhal.md`
and approved before any code was written.

## 2. MVP build — Phases 0 through 9

The plan broke MVP work into ten phases. Each shipped with a green
`npm test` + `npm run build`.

| Phase | What landed | Tests after phase |
|---|---|---|
| 0 — Scaffolding | Vite + React + TS, path aliases, ESLint, Prettier, shell layout placeholders | 0 |
| 1 — Schemas | Zod schemas: `primitives`, `entity` (AutoAttendant, Extension), `nodeData` per kind, `node` (discriminated union), `edge`, `scenario`, `flow`. PRD §11.3 example round-trips. | 4 |
| 2 — Node registry | One `NodeTypeDef` per kind: category, color, ports, defaults, palette visibility. Generic `FlowNodeView` renders every kind. Initial 38 kinds (later 39 with `action_nop`). | 8 |
| 3 — Canvas | React Flow wrapper, palette drag-drop, snap-to-grid, minimap, dagre LR auto-layout, Zustand store with `loadCounter` for fit-on-load. | 8 |
| 4 — Inspector | Field-schema-driven dispatcher. Reusable text / number / toggle / select / email inputs, dedicated `MenuActionsEditor`, `ForwardRulesEditor`. | 8 |
| 5 — Simulator engine | Pure TS, no DOM. Implements PRD §13 for extensions and §13 for AAs: screening-rules-first-match-wins, 8 answering modes, ring/forward/voicemail fallthrough, intro+menu prompts, no_input timeout, allow-direct-dial with interdigit collection, ITU 3-letter dial-by-name, recording side-effects. Deterministic by construction. | 26 |
| 6 — Simulator UI | Bottom drawer: input form, trace viewer, scenarios (save/load/run-all), canvas path-highlight (visited green, unvisited dimmed). | 26 |
| 7 — Validation | Pure validator over flow JSON: root integrity, reference resolution, reachability, forwarding-rule warnings, voicemail email gating, mode↔forwarding consistency. Inline node badges + Issues panel. | 33 |
| 8 — Import / export | Zod-validated import with preview + replace confirm; export blocked when error-severity issues exist; schema version gate (1.x accepted, 2.x rejected). | 37 |
| 9 — Polish | zundo wired (50+ steps), keyboard shortcuts (Ctrl+Z/Y, Del, Ctrl+D), two seed fixtures (Acme 3-dept AA, Extension 401 screening), dismissible welcome banner. | 37 |

## 3. Demo preset (Acme HQ)

User asked for a more elaborate fixture matching the PortaSwitch AA execution
flowchart from the docs. Result: `src/fixtures/acmeHqMultiDept.ts` — Acme
Corp HQ AA on DID +18005557890, 45 nodes:

- ROOT (always-active) with 9 menu actions plus fax and no_input
- Five department sub-menus (Sales, Support, Engineering, Billing, HR) gated
  to `business_hours`, each with a fall-through `inactive_action_node_id`
- A separate Holiday menu gated to `active_period = "holidays"` reached via
  key `0`
- 14 published directory entries for dial-by-name
- Two hunt-group references, one external emergency line, two voicemails,
  one fax mailbox, one call-recording node
- Nine pre-saved simulator scenarios covering business-hours, after-hours,
  holiday, fax, direct-dial, dial-by-name, and operator-fallback paths

Building this fixture surfaced four simulator gaps that the original
extension-focused unit tests had not exposed:

- `target_extension`, `target_external`, `target_sip_uri`, `target_hunt_group_ref`
  were dispatched through a generic "follow first outgoing edge" fallback
  that didn't ring the target.
- `fax_mailbox` was not handled.
- The standalone `voicemail` node didn't emit the email side-effect on
  direct entry (only when reached through an answering mode).

All four were fixed in the same change.

## 4. Edge inference

The fixtures stored all routing in node `data` (`actions[key].target_node_id`,
`inactive_action_node_id`, `target_node_id`, forwarding-rule targets,
etc.) and left `edges: []`. The simulator followed the data; the canvas
showed disconnected nodes.

Resolution: `src/fixtures/inferEdges.ts` walks the data and emits the
corresponding `FlowEdge[]`. Wired into all three fixtures. Menu nodes
render dynamic handles for `menu:<key>`, `inactive`, and `no_input` so the
inferred edges always have a real target handle.

The fixture dropdown was also fixed at this point so it reflects the
currently-loaded entity instead of being write-only.

## 5. Context menus + canvas affordances

UI audit pointed out the missing right-click affordance. Added:

- `ContextMenu` component with click-away + Escape dismiss, clamped to
  viewport.
- Right-click on a node → Edit, Duplicate (Ctrl+D), Delete (Del), Go to
  target. The "Go to target" walks `target_node_id` / `target_menu_node_id`
  / `mailbox_node_id` / `inactive_action_node_id` and centres the canvas
  on the resolved node.
- Right-click on an edge → Delete edge.
- Right-click on empty canvas → Auto-layout, Fit to view, quick-add
  (Disconnect / Voicemail / Transfer at click position), Clear flow with
  confirm.

Bigger, colour-coded handles (12px, source-green / target-blue, scale-up on
hover) replaced the previous 8px circles. Welcome banner dismisses to
`localStorage`. New store ops: `duplicateNode`, `removeEdge`, `clearFlow`.

## 6. Time periods

Active-period gating was originally a free-text field. Replaced with a
proper data model and editor:

- New schema: `src/schema/timePeriod.ts`. A composite period has optional
  `time_from`, `time_to`, `days_of_week` (ISO 1-7), `days_of_month`,
  `months`, `years`. AND inside a sub-period; OR across the list.
- Entities (both AA and Extension) carry an optional
  `time_periods: Record<string, TimePeriod[]>` dictionary so periods are
  reusable across menus and screening rules.
- `matchesPeriod(period, date)` evaluates correctly, including overnight
  windows (`time_from > time_to`).
- The simulator parses the input `time` as **wall-clock components**
  (regex-extracted), not as UTC, because PBX admins reason about "08:00
  local" not "08:00 UTC".
- UI: `TimePeriodEditor` (single composite), `TimePeriodsModal` (manage all
  named periods), `ActivePeriodPicker` (combobox replacement for the old
  text field). Used by menu nodes, screening rules, forwarding rules, and
  `cond_time`.
- Auto-naming: after the user said typing names first is backwards, the
  modal switched to "+ Add" buttons that create a sensible starter
  sub-period and auto-derive the name from its content. Typing into the
  rename field locks the name and stops auto-renaming.

## 7. Inspector resize

The right-hand inspector got a 5-pixel drag handle on its left edge.
`useResizable` hook, persisted in `localStorage` (`cfs.inspector.width.v1`),
clamped 240-720px. Double-click resets to 320; keyboard ArrowLeft/Right
nudge by 16. The hook is edge-aware so the same primitive can be reused
for the palette or bottom drawer later.

## 8. Call forwarding deep dive

User shared the official PortaOne MR129 Call Forwarding doc. Audit revealed
gaps we had not modelled:

- `ring_mode` was on Advanced only; the doc says **all four modes** (sequential,
  simultaneous, random, percentage) apply to Follow-me too.
- Per-target weight (`percentage_weight`) was missing.
- "Keep Original CLD" (preserves dialed DID in the To: header when
  forwarding to a PBX) was missing.
- "Visible call forward info" (replace SIP display name) was missing.
- Doc explicitly states: *"If the default answering mode does not include
  the 'Forward' action, the call will not be forwarded, no matter what
  forwarding mode is used."* — we already enforced this in the simulator
  but had no validator warning.
- Simultaneous-ring CANCEL with `Reason: SIP; cause=200; text="Call completed
  elsewhere"` was not surfaced in the trace.

All shipped in one commit:

- Schema: `RingModeSchema` with four values; `ForwardRule.percentage_weight`;
  `forward_advanced.keep_original_cld`; both forwards get
  `replace_caller_id_name`.
- Simulator: `forwardSequentialOrdered`, `forwardSimultaneous`,
  `forwardPercentage`. Random and percentage seed off
  `FNV-1a(caller + callee + time)` so the simulator stays deterministic.
- Validator: new `forward_unreachable` warning when forwarding nodes
  coexist with a non-forwarding answering mode.
- Trace: simultaneous-answer now emits a `CANCEL → ... (call completed
  elsewhere)` step on losing legs.
- Inspector: `Time check` on each forwarding rule now uses the
  ActivePeriodPicker; `Weight` only renders for the `percentage` mode.

## 9. Auto Attendant feature verification

User shared the full PortaOne Configure-the-Auto-Attendant doc. Audit
against our implementation found:

- **ROOT active period** — we locked it to `"always"`; PortaOne explicitly
  allows time-interval gating with the when-inactive chain. Unlocked;
  validator rule removed.
- **Max digits** on Prompt-for-extension and Dial-extension-directly —
  missing. Added `max_digits` to both schemas; clamped in the simulator
  for prompt-for-extension.
- **Announce Extension Numbers** (Dial-by-Name) — missing. Added
  `announce_extensions` toggle; simulator plays `ext_<extension>` prompts
  when set.
- **Input-error retry loop** (`aa_timeout` / `aa_disabled` / `max_fails`
  per the flowchart) — was a single-shot drop. Implemented full retry in
  `consumeInput`: tracks attempts up to `max_input_errors` (default 3),
  plays per-failure prompt then re-prompts; on hitting max, plays
  `max_fails_prompt` and disconnects.
- **Preferred IVR language** — added to entity schema.

UI: new `EntitySettingsModal` accessible from the top-bar (entity name,
DID/extension, preferred IVR language, directory editor with published
toggle), and Inspector now includes `max_input_errors`, `on_timeout_prompt`,
`on_unavailable_prompt`, `max_fails_prompt` per menu.

## 10. The big UX pass (`ui-improvements-2026-05-18`)

After scheduling this as a remote agent that turned out to need GitHub
auth, the work was done locally instead. Branch shipped with **13
commits**:

1. **Palette filtering by entity type.** `NodeTypeDef.primaryFor` tags
   each kind as AA-primary, ext-primary, or both. The palette demotes
   off-pattern items (opacity 0.45 + tooltip explaining where the kind is
   mainly used) rather than hiding outright, so power users still have
   access.
2. **ROOT anchoring.** Dagre upgraded to `align: "UL"`; a post-layout
   pass pins `menu_root` to the lowest y of all nodes. `FlowNodeView`
   renders a small `START` chip on `menu_root` only.
3. **Fan-in terminal dedupe** (`src/fixtures/splitFanIn.ts`). Voicemail /
   fax-mailbox / disconnect nodes with more than 2 inbound edges get
   cloned once per extra inbound source; deterministic IDs of the form
   `<original>__forMenu_<sourceId>_<handle>`. Simulator semantics
   unchanged. Wired into all three fixtures.
4. **Edge styling vocabulary** (`src/canvas/edgeStyle.ts`). Solid grey
   default; per-digit colour for `menu:0` to `menu:9` plus `#`, `*`;
   dashed warn for `inactive`; dotted yellow for `no_input`; dotted blue
   for `fax`. Memoised in the canvas.
5. **Menu actions editor redesign.** Two-line rows: line 1 = target's
   user name + speaker icon + remove; line 2 = `<kind label> → <resolved
   target>`. Speaker icon doubles as inline prompt picker.
6. **Cross-pane highlight.** New `uiStore` with ephemeral
   `hoveredMenuKey` / `flashedMenuKey`. Hovering a row bumps the matching
   outgoing edge stroke and z-index; hovering an edge flashes the row.
7. **Validation pill in top bar.** `ValidationSummary` upgraded to a
   clickable pill that opens `IssuesPanel` as a floating popover. The
   inspector-side validation block was removed.
8. **Simulator button in top bar.** Primary accent button `▶ Run
   simulator` replaces the small `▲` toggle inside the drawer.
9. **Visual refinements.** WCAG contrast: `pickHeaderText()` picks
   `#fff` vs `#11161f` by comparing actual contrast ratios. Action
   orange now reads at 8.55:1 (was 2.05:1 white-on-orange).
   MiniMap colours per node category, dark mask. Canvas hint pill tracks
   three seen-flags in `localStorage` and disappears once all three
   actions have been performed. Inspector header gains a colour chip +
   monospace id chip.
10. **Top-bar reorganization** — three clusters: entity switcher / save
    status / validation pill on the left, `▶ Run simulator` centre,
    undo/redo group + overflow `⋯` (Entity, Time periods, Import/Export,
    Help) on the right. Store gains `dirty` + `lastSavedAt` flags;
    `Export` calls `markSaved`. Help modal lists shortcuts.
11. **Inspector tabs for menus.** Field-defs gain an optional `tab`
    marker; `menu_root` / `menu_custom` fields group into General /
    Prompts / Actions / Errors. Other node kinds keep the flat layout.

Test count went 64 → 77, build green throughout.

## 11. Picking up the deferreds

Each item flagged "deferred" in the UX pass summary was then implemented:

1. **Bundle chunks** — Vite `manualChunks` split React Flow (290 kB),
   dagre (89 kB), Zod (56 kB), Zustand+zundo (3 kB) into vendor chunks.
   Main app code dropped from 562 kB to 128 kB. No more chunk-size warning.
2. **Bidirectional menu-action ↔ canvas-edge sync**
   (`src/state/menuEdgeSync.ts`). Three pure helpers, wired into the
   store:
   - `projectMenuEdges(menu, edges)` — inspector-edit → re-project edges.
   - `applyMenuConnectToActions(nodes, conn)` — onConnect from
     `menu:<key>` → write into `data.actions[key]`.
   - `applyMenuEdgeRemovalToActions(nodes, edge)` — edge delete → strip
     the matching action. Edge IDs deterministic
     (`menu_<src>_<key>`) so React Flow doesn't churn on re-sync.
3. **Do-Nothing action** (`action_nop`). Schema + registry + inspector +
   simulator with a `menuStack` on the Ctx. Hits play optional prompt,
   replay parent's menu_prompt, re-enter `consumeInput` without bumping
   the retry counter.
4. **Presence placeholder.** `PresenceIndicator` reads a local user from
   `localStorage` (rename inline by clicking the avatar). Tooltip
   explains multi-user is pending; the slot is wired so real presence
   data can drop in without rebalancing the top bar.

Final numbers: **86 tests**, main bundle **128 kB**, no warnings.

## 11a. Light theme + inspector polish (2026-05-18)

The studio embeds into a host portal that owns chrome/theme selection;
on its own the SPA was hard-coded dark. Small pass to make it portal-
ready and tighten the inspector header.

1. **Light palette via `prefers-color-scheme`.** `src/index.css`
   declares the token palette under `:root`, switches
   `color-scheme: dark` → `light dark`, and adds a
   `@media (prefers-color-scheme: light)` block that overrides every
   token (`--bg`, `--bg-elev*`, `--border`, `--text`, `--text-dim`,
   accent/danger/warn/info/ok, plus a new `--dot-grid` token). The
   canvas backdrop dot grid in `Shell.css` was the one hardcoded hex
   left over — it now reads `var(--dot-grid)` so it flips with the
   theme. The portal will drive theme selection explicitly later; until
   then the embed follows the browser preference.
2. **Contrast-safe type chip.** The inspector header's category chip
   used dark text on the registry colour, which dropped below WCAG AA
   on the darker hues (menu purple `#9d4edd` at 4.36:1). Inspector.tsx
   now exposes the colour as the `--chip-color` CSS custom property
   instead of an inline `background:` style; Inspector.css keeps the
   solid pill in dark mode and, in light mode, derives a soft tinted
   pill via `color-mix(in srgb, var(--chip-color) 18%, white)` for the
   background and `color-mix(... 80%, black)` for the text. Same
   approach works uniformly across every category colour.
3. **Hide the raw node id by default.** `uiStore` gains a persisted
   `showNodeIds` flag (off by default; mirrored to `localStorage` under
   `callflow.ui.showNodeIds`). The `<code>` chip in the inspector
   header renders only when the flag is on. The Shell overflow menu
   gets a new **Show node IDs** toggle, exposed by extending
   `OverflowItem` with an optional `checked` boolean (rendered as a
   `menuitemcheckbox` with a ✓ glyph). When the host portal is ready to
   drive this from outside, `useUiStore.getState().setShowNodeIds(...)`
   is the single entry point.

## 12. Decision log

Decisions worth carrying forward:

- **Zod is the source of truth.** TS types are inferred (`z.infer<...>`),
  not hand-written. JSON imports validate at the boundary; everything
  downstream trusts the parsed type. The trade-off is that field
  additions need to be `.optional()` (not `.default()`) when existing
  fixture literals must compile, because `.default()` makes the field
  required on the `z.infer` output.
- **Simulator is pure.** No DOM, no React, no `Date.now()`, no
  `Math.random()`. Random and percentage forwarding modes seed off
  `FNV-1a(caller + callee + time)`. The contract is byte-identical traces
  for identical inputs, enforced by tests.
- **Wall-clock time interpretation.** ISO timestamps in `input.time` are
  parsed by component, ignoring the timezone offset. PBX admins think
  locally ("open 8-18") and we honour that intent over UTC literalism.
- **Determinism of fixtures.** `splitFanIn` and `inferEdges` are pure
  functions with deterministic IDs so re-running them is a no-op-ish
  and exported JSON is stable.
- **Inspector tabs are opt-in per node kind.** Only menus declare a
  `tab` on their field defs; everything else keeps the flat layout.
  Avoids over-engineering simpler nodes.
- **Two-channel routing is now bidirectional.** Menu actions live in
  both `data.actions[key].target_node_id` AND a corresponding edge with
  sourceHandle `menu:<key>`. The store keeps them in sync; both sides
  can edit, neither is authoritative-on-paper but `data.actions` is
  written first.
- **Hunt Groups deferred but referenced.** `target_hunt_group_ref` is a
  real node kind; full hunt-group flows (members, ring policy, wrap-up
  time, diversion inhibitor) are a separate entity model to add later.

## 13. Still deferred (genuinely, this time)

- **PortaSwitch API integration.** Save/load is local JSON only; no
  PortaBilling auth, no live entity browser, no atomic remote saves.
- **Hunt Group entity.** Referenced only.
- **Call Queue as a first-class flow.** `action_queue` is a stub; a real
  queue is its own ring-strategy / overflow flow.
- **Audit / version history.** Not modelled.
- **Real-time collaboration.** Reserved slot in the top bar; no data.
- **Recurrence rules.** Time periods are component-based; iCalendar
  RRULE ("last Friday of the month") would be a separate effort.
- **Recording per-rule SIP proxy in the simulator.** The
  `sip_proxy` field is stored and editable; the simulator doesn't
  annotate it in the trace yet.
- **`keep_original_cld` / `replace_caller_id_name` trace surfacing.**
  Stored and editable but not currently shown in the trace step output.
- **Mobile editing.** Read-only on tablets; no mobile editor.

## 14. Reference

- Plan: `C:\Users\kpsol\.claude\plans\analyze-docs-and-create-immutable-narwhal.md`
- Branch: `ui-improvements-2026-05-18`
- Remote: `https://github.com/kpsolo/callflow`
- Specs sourced: PRD, Auto-attendant docx, Summary features docx,
  Supported services PDF, PortaOne MR129 Call Forwarding online doc,
  PortaOne Configure Auto Attendant online doc.
