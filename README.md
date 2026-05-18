# Call Flow Studio

A single-page visual editor for **PortaSwitch / PortaOne Cloud PBX call
routing**. It replaces the per-screen configuration of Auto Attendant
menus, Follow-me lists, Hunt Groups, Call Screening, and Voicemail with
one canvas, one inspector, and one deterministic simulator.

> **Status:** MVP, frontend-only SPA. JSON save/load, no PortaSwitch API
> integration yet. Working demos: drag-and-drop canvas, full simulator,
> validation, comments / activity / multi-tab presence.
>
> **86 → 99 tests** across the last two milestones. Build is clean
> (149 kB main bundle, no warnings).

## Who this README is for

This is the on-ramp for two audiences:

- **Business analysts / call-flow designers** — you want to understand
  what the editor does, try a demo flow, and contribute spec changes or
  feedback without writing code.
- **Developers** — you want to clone, run, write code, and ship features
  on this MVP.

Section 1 below is for everyone. Sections 2 and 3 are role-specific.

---

## 1. Common: what this is and how to look around

### The product, in one paragraph

PortaSwitch lets you configure call routing through a dozen separate
screens — one for the auto-attendant menu, another for follow-me lists,
another for screening rules — and they don't talk to each other visually.
Call Flow Studio gives you **one canvas** that shows the entire call
journey end-to-end, lets you **edit the same data PortaSwitch consumes**
(exported as versioned JSON), and includes a **deterministic simulator**
that walks a call through the flow and tells you exactly what would
happen.

### Try the demo (no install needed beyond Node)

```bash
git clone https://github.com/kpsolo/callflow
cd callflow
npm install
npm run dev          # http://localhost:5173/
```

In the running app:

1. Top bar → fixture dropdown → **"Acme HQ — multi-dept + holidays"**.
2. Click any node — the Inspector on the right shows its properties.
   Right-click for a context menu (Duplicate, Delete, Go to target).
3. Bottom drawer → **▶ Run simulator**. Pick a saved scenario or set
   inputs (caller, callee, time, key presses) and click **Run**.
4. The traced path lights up on the canvas; the trace viewer shows
   every prompt played and every side-effect emitted.
5. Top bar → **Time periods…** to edit the `business_hours`,
   `after_hours`, `weekend`, and `holidays` schedules the demo uses.

### The four documents in this repo

| File | What it is | Who reads it |
|---|---|---|
| [`history.md`](history.md) | Chronological project narrative — decisions, what shipped, what we deferred, why. | BA + dev when picking up context |
| [`project-specification.md`](project-specification.md) | Module-by-module map of the code. Every directory, every Zod schema, every public surface. | Dev |
| [`flow-logic.md`](flow-logic.md) | Verified spec of how calls are evaluated — extensions, AAs, forwarding, time periods, dial-by-name. Maps every PortaOne concept to the implementation. | BA + dev |
| [`docs/collaboration.md`](docs/collaboration.md) | How the comments / activity / lock / presence system works and how to swap the local-only backend for a real server. | Dev |

### Glossary

| Term | Meaning here |
|---|---|
| **Flow** | The exported JSON blob: one entity (AA or Extension), its node graph, its scenarios, and (when collab is on) its comments and activity. |
| **Entity** | The thing the flow describes. Either `auto_attendant` or `extension`. |
| **Node** | One configurable unit on the canvas. 39 kinds, grouped into 11 categories (entry, menu, action, answering, forwarding, screening, messaging, recording, condition, target, terminal). |
| **Edge** | A visual connection between two node handles. For menu actions, edges and `data.actions[key]` stay in sync — editing either updates the other. |
| **Active period** | A named, reusable schedule (e.g. `business_hours`, `holidays`). Defined per-entity, referenced from menus / screening rules / forwarding rules / `cond_time`. |
| **Answering mode** | One of 8 PortaOne-defined behaviours for an extension or AA (`ring_only`, `ring_then_forward`, `forward_only`, `reject`, etc.). The forwarding nodes only fire when the mode includes Forward. |
| **Simulator trace** | Step-by-step record of what the engine did with a given input. Deterministic — same input always produces the same trace. |
| **Inactive action** | What happens when a menu's `active_period` is not currently active. Chains: ROOT → fallback menu → next fallback → terminate. |
| **Direct dial** | The PortaOne feature where a caller dials an extension straight from the menu by punching its digits. Bounded by `interdigit_timeout_s`. |
| **Dial-by-name** | The ITU 3-letter directory match (2=ABC, 3=DEF, …) against published extension names. |
| **Wall-clock parsing** | We interpret the `time` field's hour and minute as local clock time, ignoring the ISO timezone offset. Matches how PBX admins think ("open 8-18"). |

---

## 2. For BAs / call-flow designers

### What you can do today without writing code

- **Open the demo flow** (Acme HQ) and inspect every department's
  routing — including how holidays differ from after-hours.
- **Run scenarios** that prove the flow does what you expect:
  business-hours, weekends, holidays, fax, no-input, direct-dial,
  dial-by-name. Hit "Run all" to batch-test every saved scenario.
- **Edit time periods** without touching code: top bar → Time
  periods… → quick-start chips (Business hours, Weekends, Empty) →
  toggle days/months/time-of-day; the name auto-derives from the
  selections.
- **Comment on any node** — open the Inspector, scroll to the
  Comments section, post. Comments persist locally and across
  browser tabs; once a server is wired up they'll persist team-wide.
- **Audit changes** — top bar overflow `⋯` → Activity log… shows
  every structural change (added / removed / renamed / retargeted).
- **Export the JSON** (overflow `⋯` → Export JSON) and attach it
  to a bug report or share with engineering. The JSON is the
  contract — what the simulator runs, what a future PortaSwitch
  integration will push.

### What's in the demo flow

`Acme HQ — multi-dept + holidays` is a real-shape AA on DID
`+1-800-555-7890`:

- ROOT menu (always active): 9 keyboard actions + fax + no-input fallback
- 5 department sub-menus (Sales, Support, Engineering, Billing, HR)
  gated to `business_hours`, each with an `inactive_action` fallback
- Separate Holiday menu gated to `active_period = "holidays"` reached
  via key `0` from ROOT
- 14 published directory entries (powers dial-by-name)
- 2 hunt-group references, 1 external emergency line, 2 voicemails,
  1 fax mailbox, 1 call-recording node
- 9 pre-saved simulator scenarios proving each path

### Where the call-routing rules are spec'd

The shipped behaviour is documented in [`flow-logic.md`](flow-logic.md).
It's the file to point an engineer at when a behaviour needs to change.
Specifically:

- **Section 4** — Extension evaluation. Screening rules first, then the
  8 answering modes.
- **Section 5** — Auto Attendant evaluation. Menu lifecycle, the retry
  loop matching the PortaSwitch flowchart, all 11 menu actions.
- **Section 7** — Call forwarding. All 4 forwarding shapes × all 4
  distribution modes (sequential, simultaneous, random, percentage).
- **Section 9** — Terminal codes (what "answered" vs "forwarded_answered"
  vs "rejected" vs "dropped" mean exactly).
- **Section 11** — Validation rules. What the editor will flag and why.

### How to file a request

- **Spec question / behaviour clarification** — open an issue or
  comment directly in the app on the node that's confusing.
  Comments stay attached to the node even if the canvas re-flows.
- **New scenario to cover** — add it via Simulator → Scenarios → Save,
  export the flow, attach. The engineer can re-import and the
  scenario travels with the flow.
- **Spec doc updates** — edit the relevant `.md` (history,
  flow-logic, collaboration) and open a PR. None of these docs need
  TypeScript knowledge to edit.

---

## 3. For developers

### Quick start

```bash
npm install
npm run dev          # Vite dev server, hot reload at :5173
npm test             # vitest run — 99 passing
npm run build        # tsc -b + vite build — clean
npm run lint
npm run format
```

Node 20+. No other tooling required.

### Stack

- **React 18** + **TypeScript 5.6** (strict) + **Vite 5**
- **React Flow 11** — canvas, nodes, edges
- **Zod** — single source of truth for all data shapes; TS types are
  always `z.infer<typeof X>`, never hand-written
- **Zustand** + **zundo** — store with undo/redo
- **dagre** — auto-layout
- **react-hook-form** — inspector forms
- **Vitest** + **@testing-library** — tests
- **BroadcastChannel** + **localStorage** — local collaboration backend

### Project layout (high-level)

Full module-by-module map: [`project-specification.md`](project-specification.md).

```
src/
  api/              CollabClient interface + LocalStorageClient impl
  app/              Top-level Shell, top-bar bits, modals, presence
  canvas/           React Flow wrapper, context menus, edge styling, dagre
  fixtures/         Demo flows; pure helpers (inferEdges, splitFanIn)
  inspector/        Right-pane: fields, MenuActionsEditor, CommentsPanel
  io/               JSON export/import + schema-version gating
  nodes/            Registry (per-kind metadata) + custom node view
  palette/          Left-pane drag source; entity-filtered
  schema/           Zod schemas — flow, entity, nodeData, timePeriod
  simulator/        Pure TS engine + Simulator UI panel
  state/            Zustand stores, menu-edge sync, activity recorder
  validation/       Pure validator + Issues panel + top-bar pill
docs/
  collaboration.md  Collab architecture and backend swap guide
```

### Key conventions

These are documented in detail in
[`project-specification.md`](project-specification.md) §15, but in short:

- **Schema first** — never add a field to a node without adding it to
  the Zod schema first. TS types follow automatically.
- **Simulator is pure** — no `Date.now()`, no `Math.random()`. Same
  input → byte-identical trace. Random/percentage forwarding seeds off
  `FNV-1a(caller + callee + time)`.
- **Pure modules over framework code** — anything not strictly UI lives
  outside React (simulator, validation, fixtures, state sync helpers,
  contrast helper, edge styling). Test them without spinning up jsdom.
- **`.optional()` over `.default()` on Zod schemas added late.**
  `.default()` makes the field required on the `z.infer` output and
  breaks existing object literals; use `.optional()` + fallback at the
  use site.
- **CSS variables**, not hex literals, in component CSS. Palette
  colours on nodes are an exception (set inline from the registry).

### How to add a new feature — common recipes

| Task | Steps |
|---|---|
| **Add a node kind** | 1) Add to `NODE_KINDS` in `src/schema/node.ts`. 2) Define `<kind>DataSchema` in `nodeData.ts`. 3) Add a registry entry in `src/nodes/registry.ts` (category, color, ports, defaultData, optional `primaryFor`). 4) Add inspector fields in `src/inspector/fields.ts`. 5) If runtime-relevant, handle it in `src/simulator/engine.ts` `runNode`. 6) Test in `src/simulator/__tests__/`. |
| **Add a validation rule** | Add a check in `src/validation/validate.ts`. Use the `add(ctx, { code, severity, message, node_id })` helper. Test in `src/validation/__tests__/validate.test.ts`. |
| **Wire a new collab feature** | Extend `CollabClient` in `src/api/client.ts` with new methods. Add impl to `LocalStorageClient`. UI component imports `useCollab()`. Server impl later just satisfies the same interface. |
| **Add a fixture** | New file in `src/fixtures/`, register in `src/fixtures/index.ts`. Call `splitFanIn(nodes, inferEdges(nodes))` so the canvas reads cleanly. |
| **Change a field's editor** | `src/inspector/fields.ts` defines per-kind field arrays. `FieldDef.type` dispatches to text / number / toggle / select / `active-period` / `rules-list` / `actions-map` / etc. Add a new `type` by extending `FieldType` and adding a branch in `Inspector.tsx` `FieldRow`. |

### Branches

| Branch | Status | What's in it |
|---|---|---|
| `main` | Stable | First commit only (initial scaffold + spec docs). |
| `ui-improvements-2026-05-18` | Merged-ready | The big UX pass: palette filtering, ROOT anchor, fan-in dedupe, edge styling vocabulary, menu actions redesign, cross-pane highlight, validation pill, sim button, top-bar reorg, inspector tabs. 13 commits, 86 tests. |
| `collab-2026-05-18` | Active (this work) | Collaboration: CollabClient seam, LocalStorageClient (localStorage + BroadcastChannel), identity / comments / lock / presence / activity log. 5 commits, 99 tests. |

Open PRs at https://github.com/kpsolo/callflow/pulls.

### Tests at a glance

99 tests across 14 files. Run all: `npm test`. Run one: `npx vitest run <path>`.

| Area | Tests | File |
|---|---|---|
| Schema round-trip + period evaluator | 11 | `src/schema/__tests__/` |
| Node registry + contrast picker | 8 | `src/nodes/__tests__/` |
| Canvas edge styling | 6 | `src/canvas/__tests__/` |
| Menu ↔ edge sync helpers | 7 | `src/state/__tests__/` |
| Validation rules | 8 | `src/validation/__tests__/` |
| Export/import | 4 | `src/io/__tests__/` |
| Simulator: extensions | 8 | `src/simulator/__tests__/extension.test.ts` |
| Simulator: auto attendants | 19 | `src/simulator/__tests__/autoAttendant.test.ts` |
| Simulator: forwarding | 9 | `src/simulator/__tests__/forwarding.test.ts` |
| Fixtures | 6 | `src/fixtures/__tests__/` |
| Collab API | 13 | `src/api/__tests__/` |

### Where to look for an architectural answer

| Question | Read |
|---|---|
| Why was X done this way? | [`history.md`](history.md) §12 "Decision log" |
| Where does node-kind X live? | [`project-specification.md`](project-specification.md) §3-4 |
| What does the simulator actually do? | [`flow-logic.md`](flow-logic.md) §4 (ext) / §5 (AA) / §7 (forwarding) |
| How does menu-action ↔ edge sync work? | [`project-specification.md`](project-specification.md) §5 → `src/state/menuEdgeSync.ts` |
| Why does the contrast helper exist? | [`history.md`](history.md) §10 visual refinements; `src/nodes/contrast.ts` |
| How would I plug in a real backend? | [`docs/collaboration.md`](docs/collaboration.md) "Swapping in a real backend" |
| What's been deferred and what's actually done? | [`history.md`](history.md) §13 |

### Honest gaps to know about

- **No PortaSwitch API integration.** Save/load is local JSON. A future
  HTTP client implementing `CollabClient` is the obvious next step.
- **No Hunt Group entity.** `target_hunt_group_ref` exists as a
  reference; the entity with members / ring policy / wrap-up is not
  modelled.
- **No Call Queue as a flow.** `action_queue` is a stub.
- **No real-time backend yet.** Multi-tab sync works (BroadcastChannel);
  cross-machine sync needs the HTTP `CollabClient`.
- **`keep_original_cld` and `replace_caller_id_name`** on forwarding
  are editable and exported but not yet annotated in the simulator
  trace. Easy follow-up.
- **Bundle size warning:** none. Main app 149 kB / 41 kB gzip after
  vendor splits.

---

## How to contribute

1. Fork or branch from `main` (or whichever branch is most recent).
2. Make changes. Run `npm test` and `npm run build` before pushing.
3. For UI changes, run `npm run dev` and verify with one of the demo
   fixtures (Acme HQ exercises 45 of the 39 node kinds in real shape).
4. For spec changes, edit the relevant `.md` document. The docs are
   the spec — keep them in sync with the code.
5. Open a PR. Add yourself to the activity log description if you
   want; the in-app activity feed will pick up your commits' effects
   on the flow JSON automatically.

For questions you'd rather not file as an issue, comment directly on
the relevant node in the running app — the comment travels with the
exported flow and lands in whoever reviews next.

## License

Internal — PortaOne. Distribute via the kpsolo/callflow repository.
