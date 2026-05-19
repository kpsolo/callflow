# Call Flow Logic — Cloud PBX Semantics

A precise reference for how calls are evaluated by Call Flow Studio and how
those rules trace back to PortaSwitch / PortaOne behaviour. Every statement
here is verified against `src/simulator/engine.ts` and the source documents
listed at the bottom.

Sources

- `docs/Call_Flow_Studio_PRD.docx` (PRD, internal)
- `docs/Auto attendant.docx` (PortaSwitch AA reference)
- `docs/Summary features .docx`
- `docs/supported services.pdf`
- PortaOne MR129 "Call Forwarding" online doc
- PortaOne "Configure the Auto Attendant" online doc

## 1. Cloud PBX object model

| Object | Models | Implemented in |
|---|---|---|
| **Extension** | A user / phone with its own number, voicemail, screening rules and forwarding. | `EntitySchema` discriminant `"extension"` |
| **Auto Attendant** | A DID-attached IVR with a tree of menus, each with its own active period and actions. | `EntitySchema` discriminant `"auto_attendant"` |
| **Menu** | The unit of AA navigation. Always one mandatory ROOT plus any number of custom sub-menus. | `menu_root`, `menu_custom` |
| **Menu Action** | What happens when the caller presses a key, no input is received, or fax tone is detected. 11 kinds. | `action_*` node kinds |
| **Forwarding Configuration** | One of four shapes, per extension: Simple, SIP URI, Follow-me, Advanced. | `forward_*` nodes |
| **Screening Rule** | An extension-level pre-filter that overrides the default answering mode when its conditions match. | `screening_rule` |
| **Voicemail / Fax Mailbox** | Per-extension or per-AA storage for unanswered/inbound messages. | `voicemail`, `fax_mailbox` |
| **Call Recording** | Side-effect attached implicitly to any answered leg of an extension or AA. | `call_recording` |
| **Hunt Group** | Referenced only — full hunt-group entity (members, ring policy, wrap-up time, diversion inhibitor) is out of scope. | `target_hunt_group_ref` |
| **Call Queue** | Referenced only — full queue model is out of scope. | `action_queue` |
| **Time Period** | A named, reusable schedule definition stored on the entity. Used by menus, screening rules, forwarding rules, and `cond_time`. | `entity.time_periods`, `TimePeriodList` |
| **Directory** | An AA's published extension list, used by dial-by-name and direct extension dial. | `entity.directory[]` |

## 2. Call lifecycle (background)

This is what happens around the editor. None of it is in the simulator —
the simulator picks up after authorization and routing have completed.

1. **SIP registration.** IP phone → PortaSIP REGISTER → PortaSIP forwards to
   PortaBilling for digest authentication, which verifies account, password,
   and service eligibility.
2. **Call setup.** Caller dials. PortaSIP authorizes with PortaBilling
   (existence of the account, dialing rules, balance, allowed
   destinations, maximum call duration).
3. **Routing.** PortaBilling decides whether the call is direct
   SIP-to-SIP, terminated to a vendor, or routed to an Auto Attendant.
4. **Entry into the editor's domain.** Calls landing on an Extension
   start at the Extension entity's evaluation (section 4); calls landing
   on an AA's DID start at ROOT (section 5).

## 3. Inputs the simulator consumes

```
SimulatorInput {
  caller            string         // E.164 or "anonymous" or extension
  callee            string         // DID or extension
  time              string         // ISO-8601, wall-clock components
  active_mode?      string         // current incoming-call mode override
  press_sequence?   MenuInputKey[] // "0".."9" "*" "#" "fax" "no_input"
  answering_behavior?[] AnsweringBehavior // per-target answer override
  active_periods?   string[]       // manual period override (debugging)
}
```

`AnsweringBehavior.outcome` is one of `answer_after`, `never_answer`,
`busy`, `network_fail`. When omitted, the default is `answer`.

## 4. Extension evaluation (PRD §13.1)

`runExtension(ctx)` in `engine.ts`. Order:

1. Collect every `screening_rule` whose `enabled = true`, sort by
   `data.order` ascending.
2. For each rule, evaluate `matchesScreening(rule, ctx)`:
   - **time_period** must be currently active (see section 9).
   - **caller** check: any / number == / prefix startsWith / regex test
     / anonymous / caller_list (caller_list is treated as `==` in MVP).
   - **callee** check: any, or `==` the dialed number.
   - **mode** check: if both `rule.conditions.mode` and `input.active_mode`
     are set, they must match.
   - All present checks must pass (AND).
3. First match wins. The rule's `play_before_action` plays, then control
   transfers to `runExtAnsweringMode` with the rule's `action_mode`.
4. If no rule matches, the single `answering_mode_ext` node on the flow
   dictates behaviour. If absent, the call terminates as `dropped`.

### 4.1 The eight extension answering modes

`AnsweringModeExtSchema`. The flow chart in PRD §5.1 / §13.1 is
implemented exactly:

| Mode | Behaviour |
|---|---|
| `reject` | Terminate `rejected` with `SIP <reject_sip_code>` (default 486). |
| `ring_only` | Ring extension for `ring_timeout_s`. Answer → `answered`. Busy → `rejected (busy)`. Network-fail or no-answer → `dropped`. |
| `voicemail_only` | Go straight to `goVoicemailExt` → `voicemail_left`. |
| `forward_only` | Go straight to `goForwardExt` (section 7). |
| `ring_then_voicemail` | Ring, then on timeout / no answer → voicemail. |
| `ring_then_forward` | Ring, then on timeout / no answer → forward. |
| `forward_then_voicemail` | Forward first. If `forwarded_unanswered` or `dropped` → voicemail. |
| `ring_forward_voicemail` | Ring, then on timeout → forward, then on `forwarded_unanswered` / `dropped` → voicemail. |

> PortaSwitch fact (MR129 Call Forwarding doc):
> *"If the default answering mode that is set for a specific account does
> not include the 'Forward' action ('Ring then voicemail', 'Ring only',
> 'Voicemail only' or 'Reject'), then the call will not be forwarded, no
> matter what forwarding mode is used."*
>
> The simulator only invokes `goForwardExt` for the four modes that
> include Forward. Existence of a forwarding node alongside (say) `ring_only`
> is flagged by the validator (`forward_unreachable` warning) but does
> not change runtime behaviour.

### 4.2 Ring outcomes

`ring(ctx, timeout, fallback)`:

- Answer → tick 1500 ms (call-setup), apply recording if a `call_recording`
  node exists, terminate `answered`.
- Busy → terminate `rejected` (`Busy`). PortaSwitch returns SIP 486 Busy
  Here; the simulator uses `rejected` as the terminal code because the
  call is rejected at the answering leg, not connected.
- Network fail → terminate `dropped` (`Network failure`).
- Ring timeout → advance simulated time by `timeout * 1000` ms, then
  recurse into the configured fallback (`voicemail`, `forward`,
  `forward_then_voicemail`, or `dropped`).

## 5. Auto Attendant evaluation (PRD §13.2)

`runAutoAttendant(ctx)` in `engine.ts`. Order:

1. Look up the (singleton) `menu_root` node. Missing → `dropped`.
2. If an `answering_mode_aa` node is present:
   - `reject` → terminate `rejected` with SIP code.
   - Any other mode falls through to the menu logic. (PRD allows
     ring/forward-into-IVR variants but in MVP the only branching is
     reject vs not-reject.)
3. Enter ROOT via `runMenu`.

### 5.1 runMenu(menu)

Each menu invocation:

1. Push menu onto `Ctx.menuStack` (used by `action_nop` to return).
2. **Active period check** (`isPeriodActive`): if not active, look up
   `inactive_action_node_id`. Configured → execute via
   `runActionByNodeId`. Missing → terminate `disconnected`.
3. **Intro prompt**: played once per call (`ctx.introPlayed` latches on
   first menu entry). PortaSwitch behaviour: only the first menu's intro
   plays; later menu transitions only play their menu prompts.
4. **Menu prompt**: played every time the menu is entered or replayed.
5. `consumeInput(ctx, menu)` — see 5.2.

### 5.2 consumeInput retry loop (PortaSwitch AA flowchart)

The flowchart from the AA doc maps onto this single function:

```
attempts = 0
loop while attempts < menu.max_input_errors (default 3):
  if no more presses remaining:
    advance time by menu.no_input.timeout_s * 1000
    if menu.actions.no_input is configured:
      run that action (NO retry, exit loop)
    else if menu.no_input.action_node_id is set:
      run that action
    else:
      attempts++
      play menu.on_timeout_prompt or "aa_timeout"
      if attempts < max:
        play menu.menu_prompt   // replay
        continue
      break

  if menu.allow_direct_dial:
    try collecting consecutive digits as a published-extension match
      against the AA's directory. The collector stops when either
      (a) a published extension exactly matches the digits collected,
          or
      (b) no extension could still match (no published extension starts
          with these digits and has more characters).
    If matched: terminate "answered" with detail "Direct-dial → <ext>".
    Otherwise: fall through, the first digit is still queued.

  key = next press
  pressIndex++
  if menu.actions[key] exists:
    play action.play_before_action if set
    run action.target_node_id (no retry counter bump)
    EXIT loop  (action takes over)

  // unmatched key
  attempts++
  play menu.on_unavailable_prompt or "aa_disabled"
  if attempts < max:
    play menu.menu_prompt
    continue

// fell out of loop
play menu.max_fails_prompt or "max_fails"
terminate "disconnected" "Max input errors (<N>) exceeded"
```

Note: the simulator increments the attempt counter for **two**
categories — unmatched key, and no-input timeout when there's no
configured no_input action. Matched actions never count toward retry.

### 5.3 The 11 menu actions

| Kind | Behaviour in simulator |
|---|---|
| `action_transfer` | Recurse into `target_node_id`. Used to wrap a Target node (extension, hunt group, external, SIP URI). |
| `action_transfer_e164` | Ring `data.number` directly via `answeringFor`. Answer → `forwarded_answered`; no-answer → `forwarded_unanswered`. |
| `action_prompt_extension` | Play optional prompt. Read **up to** `max_digits` consecutive digit keys from the press queue (default 5). Match against the published directory. Match → terminate `answered`. No digits → `disconnected`. No match → `dropped` with `(max <n> digits)` detail if the clamp was hit. |
| `action_dial_direct` | Standalone — not used in the MVP. The simulator returns `dropped` if reached directly; direct-dial is exercised via the menu's `allow_direct_dial` flag instead. |
| `action_voicemail` | Hand control to a specific `voicemail` node (`mailbox_node_id`) or the first voicemail in the flow. Plays greeting prompt, queues email side-effect if option ≠ none and address set, terminates `voicemail_left`. |
| `action_dial_by_name` | Consume up to 3 digit keys (2-9). Map each digit via the ITU keypad to its letter set; match against the first 3 letters (alpha only, uppercase) of every `published` directory name. 0 matches → `dropped`. 1 match → terminate `answered` (plays `ext_<ext>` if `announce_extensions` is on). >1 matches → terminate `answered` with "list-select" detail (announces all if `announce_extensions`). |
| `action_disconnect` | Play optional `play_before_action`. Terminate `disconnected`. |
| `action_disa` | Play optional password prompt. MVP stub — terminates `answered` with `"DISA accepted (MVP stub)"`. Real PortaSwitch flow would gate on a password and then allow an outbound dial. |
| `action_queue` | MVP stub — terminate `answered` with `"Queue (MVP stub)"`. |
| `action_nop` | Play optional prompt. Pop nothing — replay the parent menu's `menu_prompt` and re-enter `consumeInput`. Does **not** count toward the retry budget. Used to lock down a key without leaving it undefined. |

A menu action whose `target_node_id` points directly at another
`menu_root` / `menu_custom` node is routed through `runMenu` by
`runNode`. The retired `action_goto_menu` indirection node is no
longer needed — its only behaviour was a one-hop trampoline that the
direct-target dispatch now handles in place.

### 5.4 Direct extension dial (`allow_direct_dial`)

From the PortaSwitch doc:

> *"The feature is feasible when an extension number starts with the same
> digit as the 'Dial extension directly' option (e.g., 3). Dial 3011; if
> you dial 3-3011, the extension won't be found."*

The simulator's collector is more general — it doesn't require a
specific "first digit" trigger because the menu's `allow_direct_dial`
toggle is global to the menu. It collects consecutive digit keys, looks
for an exact published-extension match after each addition, and gives up
the moment no published extension could still match the accumulated
prefix. This honours the spirit of the PortaSwitch rule (the published
directory drives the match) without imposing the per-key "first digit"
configuration step.

### 5.5 Dial-by-name (`action_dial_by_name`)

ITU phone-keypad map:

```
2 ABC   3 DEF   4 GHI   5 JKL
6 MNO   7 PQRS  8 TUV   9 WXYZ
```

The matcher:
- Pops up to 3 digits from the press queue. Digits outside 2-9 break the
  collection.
- Filters the directory to `published === true`.
- For each entry, strips non-letters from `name` and takes the first 3
  letters upper-cased. Skips entries whose stripped-name is shorter
  than 3 characters.
- An entry matches when, for every digit `d[i]`, the keypad letters for
  `d[i]` contain the letter at position `i` of the first-3.

If `announce_extensions` is on, each match's extension is announced
(`ext_<extension>` prompt) before terminating.

## 6. Time periods

`src/schema/timePeriod.ts`. Composite per-sub-period structure:

```
TimePeriod {
  time_from?       string  "HH:MM" 24h
  time_to?         string  "HH:MM" 24h
  days_of_week?    int[]   ISO 1 (Mon) .. 7 (Sun)
  days_of_month?   int[]   1..31
  months?          int[]   1..12
  years?           int[]   1970..3000
}
```

A **named period** is an array of these (`TimePeriodList`).

**Evaluation rules**:

- **AND inside a sub-period** — every set field must match. Undefined
  fields mean "any".
- **OR across the list** — the named period is active if any sub-period
  matches.
- **Overnight windows** — when `time_from > time_to`, the window wraps
  midnight (e.g. `22:00` → `06:00` matches `23:30` and `04:00`).

`isPeriodActive(ctx, period)` resolution order:

1. The literal `"always"` is always active.
2. If `input.active_periods` includes the name → active. (Override hook
   for what-if testing.)
3. Look up `entity.time_periods[name]`. Evaluate against the call time
   parsed as wall-clock components (section 6.1). Any match → active.
4. Otherwise inactive.

### 6.1 Wall-clock parsing

`parseWallClock(iso)` regex-extracts `YYYY-MM-DDTHH:MM[:SS]` from the
ISO timestamp and constructs a Date with **local-time** components,
ignoring the timezone offset.

Rationale: PBX admins reason in local terms ("open 8-18"). An ISO string
`2026-05-18T10:00:00-07:00` and `2026-05-18T10:00:00+02:00` both mean
"10 AM on the clock" for period evaluation. The simulator honours that
intent over UTC literalism.

A timezone-aware variant (per-entity IANA TZ) is a possible
non-breaking future addition; today the entity carries
`preferred_ivr_language` but no timezone.

### 6.2 Auto-named periods

The UI defaults to auto-derived names:

| Components | Auto-name |
|---|---|
| `days_of_week=[1..5]` | `weekdays` |
| `days_of_week=[6,7]` | `weekends` |
| `time_from=09:00 time_to=17:00 days=[1..5]` | `weekdays_0900_1700` |
| `months=[12] days_of_month=[25]` | `dec_day_25` |
| Empty composite | `any_time` |
| Multi sub-period | `<firstName>_plus_<N-1>` |

User-typed names lock auto-renaming for that period.

## 7. Call forwarding (PortaOne MR129)

Forwarding only fires when the **answering mode** routes there — see
section 4.1. Once invoked:

| Node | Behaviour |
|---|---|
| `forward_simple` | Single target (`target_number`). `tryForwardOne` rings for `timeout_s`. Answer → `forwarded_answered`. No-answer / busy / fail → `forwarded_unanswered`. |
| `forward_sip_uri` | Same shape as Simple but with `target_uri`, optional `sip_proxy`, and `timeout_s`. |
| `forward_follow_me` | Multiple `rules[]`. Each rule has `target_node_id`, `time_check` (named period), `timeout_s`, `enabled`, optional `sip_proxy`, optional `percentage_weight`. The `ring_mode` field decides distribution (see 7.1). |
| `forward_advanced` | Follow-me + per-rule SIP-proxy override + two flags: `keep_original_cld` (preserve dialed DID in the To: header) and `replace_caller_id_name` (rewrite SIP Display Name). |

### 7.1 Distribution modes (`ring_mode`)

Per the PortaOne doc:

> *"Users can also specify whether these multiple numbers should be
> tried one after another, at the same time, in a random order, or
> calls should be distributed based on the set percentage."*

`RingModeSchema` matches: `sequential`, `simultaneous`, `random`,
`percentage`. The simulator dispatches in `goForwardExt`:

| Mode | Behaviour |
|---|---|
| `sequential` | Iterate enabled+active rules in declared order. First answer → `forwarded_answered`. Otherwise fall through (per-rule timeout ticks simulated time). |
| `simultaneous` | Every enabled+active rule "rings" at once. First answerer wins (rule-order as tie-break). Trace emits a `CANCEL → ... (call completed elsewhere)` step on losing legs, matching the SIP CANCEL `Reason: SIP; cause=200; text="Call completed elsewhere"` PortaSwitch sends. If nobody answers, simulated time advances by the longest rule timeout, then `forwarded_unanswered`. |
| `random` | Deterministic Fisher–Yates shuffle of the rules using `seedFromCall`, then sequential through the shuffled order. |
| `percentage` | Weighted pick of **one** rule using `seedFromCall` modulo total weights (default weight = 1 when unset). The chosen target either answers (terminal) or doesn't (`forwarded_unanswered`). No retry — percentage is documented as load distribution, not a fallback chain. |

### 7.2 Determinism contract

`seedFromCall(ctx)` is **FNV-1a 32-bit** over the string
`<caller>|<callee>|<time>`. Random and percentage modes both seed off
this. Two identical inputs always produce byte-identical traces.

### 7.3 Per-rule time gating

Each rule's `time_check` is a named period. Inactive rules are filtered
out **before** distribution logic — so a Follow-me list with rules
gated to `business_hours` and `after_hours` will only consider the
currently-active subset.

### 7.4 Recording on the answered leg

`applyRecordingIfConfigured(ctx)` runs whenever a forward leg or extension
ring answers. It looks up a single `call_recording` node and applies it
according to the MR129-mapped fields documented in section 7.5.

### 7.5 Call recording (`call_recording` — MR129)

| Field | Type | Doc reference | Behaviour |
|---|---|---|---|
| `mode` | `"automatic" \| "on_demand"` | "Activation modes" | Automatic records every answered leg. On-demand requires the caller's `manual_record` input. Default `automatic`. |
| `allow_manual_start_stop` | boolean | "On-demand call recording" | Gate for on-demand mode. When false, on-demand never fires. |
| `start_dtmf_code` / `stop_dtmf_code` | string | "DTMF codes" | PortaSwitch defaults `*44` / `*45`. Stored only; the simulator drives manual recording via `manual_record` (see below) rather than DTMF parsing, because DTMF codes during an active call aren't menu events. |
| `announce_to_all` | boolean | "Call recording announcement" | Plays "Call recording started" to all parties. Falls back to legacy `announce` flag for older JSON. |
| `announce_started_prompt` | prompt id | "Call recording announcement" | Played when recording begins. |
| `announce_stopped_prompt` | prompt id | "Call recording announcement" | Played when recording ends, but only if `manual_record === "started_stopped"`. |
| `auto_record_incoming` | boolean | "Important notes" | PortaSwitch records all incoming, ignoring forward decisions. Stored in our model; the simulator doesn't currently distinguish "before forward" vs "after forward". |
| `auto_record_redirected` | boolean | "Important notes" | Records calls forwarded outside the PortaSwitch network. Stored only. |
| `format` | `"wav" \| "mp3"` | "Important notes" | Annotated in the `recording_started` side-effect's detail. Default `wav`. |
| `send_to_email` | email | "End users can receive call recordings in the email notifications…" | Annotated in side-effect detail. |
| `private_to_owner` | boolean | "Show the call recording to myself only" | Annotated in side-effect detail as `private`. |
| `enable_transcription` | boolean | "Transcription of call recordings" | When true, emits `transcription_queued` side-effect after `recording_started`. |

#### Simulator behaviour

Given an answered leg and one `call_recording` node:

1. Determine effective mode: `mode ?? "automatic"`.
2. If `on_demand` and either `allow_manual_start_stop` is false or
   `input.manual_record` is `"off"` (default), **skip recording entirely**.
3. Play `announce_started_prompt` (or legacy `announce_prompt`) if
   announcement is enabled.
4. Emit `recording_started` with detail
   `format=<wav|mp3> <email=…|local> [private]`.
5. If `input.manual_record === "started_stopped"`, play
   `announce_stopped_prompt` and emit `recording_stopped`.
6. If `enable_transcription`, emit `transcription_queued`.

The `SimulatorInput.manual_record` field is the lever for on-demand:

| Value | Meaning |
|---|---|
| `"off"` (default) | Caller never pressed start. |
| `"started"` | Caller pressed start; recording continued through hang-up. |
| `"started_stopped"` | Caller started and stopped before hang-up. |

#### Validation rules (recording-specific)

| Code | Severity | Trigger |
|---|---|---|
| `recording_on_demand_disabled` | warning | `mode = on_demand` but `allow_manual_start_stop` is false. |
| `recording_mode_conflict` | warning | On-demand mode plus `auto_record_incoming` or `auto_record_redirected` (the auto-toggles only apply to automatic). |
| `recording_announce_no_prompt` | warning | `announce_to_all` is on but no `announce_started_prompt` / `announce_prompt` set — PortaSwitch falls back to the English system prompt. |
| `recording_stopped_prompt_orphan` | warning | Stopped prompt set with no started prompt — the stop announcement will never play. |

#### Known gaps vs. MR129

- **No CDR model.** PortaSwitch only records when a CDR exists for the
  billed account (e.g., parked-call retrieval on a different account
  doesn't generate a CDR, so no recording). We don't model CDRs;
  recordings fire on any answered leg.
- **External SFTP / Call Cabinet** storage is admin tenant-level
  configuration, not flow logic. Out of scope.
- **Codec recognition.** PortaSwitch supports G.711/G.729/G.723/Opus.
  Codec selection is a service-policy concern, not a flow field.
- **Attended-transfer recording chain** (records all subsequently
  transferred calls when started before the transfer) requires a
  multi-call model we don't have.
- **DTMF codes are stored but not parsed.** The on-demand path uses an
  explicit `manual_record` input flag instead. The codes round-trip
  through JSON for the future server implementation.

## 8. Voicemail and fax mailbox

| Configurable | Field | Effect |
|---|---|---|
| Greeting | `voicemail.greeting` ∈ {standard, personal, name, extended_absence} | Played as `voicemail_<greeting>` prompt on entry. |
| Require PIN | `voicemail.require_pin` | Stored, not exercised by the simulator. |
| Auto-play on login | `voicemail.auto_play` | Stored, not exercised. |
| Announce date/time | `voicemail.announce_datetime` | Stored, not exercised. |
| Email delivery option | `voicemail.email_option` ∈ {none, forward, forward_as_attachment, copy, notify} | When ≠ `none` and `email_address` is set, the simulator emits an `email_queued` side-effect on entry. The validator errors when option is set without an address (`voicemail_email_address`). |
| Email address | `voicemail.email_address` | Same as above. |
| Fax mailbox | `fax_mailbox.*` | Same email-option semantics. Entry emits a `fax_stored` side-effect. Terminal is `voicemail_left` with detail `"fax stored"`. |

## 9. Terminal codes

| Code | Triggered by |
|---|---|
| `answered` | Extension ring answered, dial-direct match, dial-by-name match, prompt-for-extension match, action_queue stub, action_disa stub, target_extension / target_external / target_sip_uri / target_hunt_group_ref ringing answer, term_answered node. |
| `voicemail_left` | Voicemail / fax_mailbox entry, `goVoicemailExt`, term_voicemail_left. |
| `forwarded_answered` | Successful forward, `tryForwardOne` answer, `action_transfer_e164` answer, target nodes reached through a forward, term_forwarded_answered. |
| `forwarded_unanswered` | Follow-me / Advanced fallthrough with no answer, simultaneous all-failed, percentage pick that didn't answer, `action_transfer_e164` no-answer / busy / fail, term_forwarded_unanswered. |
| `rejected` | Extension ring busy (PortaSwitch SIP 486), `reject` answering mode, `target_extension` busy, term_rejected. |
| `disconnected` | `action_disconnect`, inactive menu with no fallback, max input errors exceeded, prompt-for-extension empty input. |
| `dropped` | Step-limit exceeded, missing required node, unhandled node kind, network failure on extension ring, dial-direct standalone (unimplemented). |

## 10. Side-effects emitted in the trace

`SideEffect.kind` is one of:

- `recording_started` — `applyRecordingIfConfigured` on any answered leg.
  Detail: `format=<wav|mp3> <email=…|local> [private]`.
- `recording_stopped` — caller stopped on-demand recording mid-call.
  Only fires when `manual_record === "started_stopped"`.
- `transcription_queued` — call_recording has `enable_transcription`.
  Fires after `recording_started` (or `recording_stopped` for on-demand).
- `email_queued` — voicemail with email option set and address present.
- `fax_stored` — fax_mailbox entry with email address.

Each side-effect carries `at_ms` (the simulated elapsed time at which it
fired) plus a free-text `detail` (target email, etc.).

## 11. Validation rules (PRD §9.5)

Run on every flow change. Code in `src/validation/validate.ts`.

| Code | Severity | Trigger |
|---|---|---|
| `root_missing` | error | AA flow without `menu_root` |
| `root_duplicate` | error | More than one `menu_root` |
| `root_name` | error | ROOT renamed (must be literal `"ROOT"`) |
| `menu_action_ref` | error | A menu action's `target_node_id` doesn't resolve |
| `menu_inactive_ref` | error | `inactive_action_node_id` doesn't resolve |
| `menu_noinput_ref` | error | `no_input.action_node_id` doesn't resolve |
| `forward_rule_ref` | error | A forwarding rule's `target_node_id` doesn't resolve |
| `no_entry` | warning | No `incoming_call` / `menu_root` / `answering_mode_ext` present |
| `no_terminal` | warning | No terminal-like node anywhere (call may drop silently) |
| `forward_no_rules` | warning | Follow-me / Advanced forwarding with no enabled rules |
| `voicemail_email_address` | error | `email_option ≠ "none"` but no `email_address` |
| `mode_missing_forward` | error | Extension answering mode uses Forward but no forwarding node exists |
| `forward_unreachable` | warning | Forwarding node present but answering mode never triggers Forward |
| `recording_on_demand_disabled` | warning | `call_recording.mode = on_demand` but `allow_manual_start_stop` is false |
| `recording_mode_conflict` | warning | On-demand mode plus `auto_record_incoming` or `auto_record_redirected` |
| `recording_announce_no_prompt` | warning | Announcement is on but no started prompt is configured |
| `recording_stopped_prompt_orphan` | warning | Stopped prompt set with no started prompt |

ROOT's `active_period` is **not** forced to `"always"` — PortaOne allows
time-interval gating with the when-inactive chain. Only singleton + name
are enforced.

## 12. Determinism contract (summary)

A simulation is fully deterministic when:

- The `Flow` JSON is fixed.
- `SimulatorInput` is fixed (same caller, callee, time, press_sequence,
  active_mode, active_periods override, answering_behavior).

Then `simulate(flow, input)` produces byte-identical `Trace`. Enforced
by:

- No `Date.now()` anywhere in the simulator. Times come from
  `input.time` and `tick(ctx, ms)` accumulators.
- No `Math.random()`. Random and percentage forwarding use
  `seedFromCall` (FNV-1a hash of caller|callee|time).
- Pure functions for period evaluation, screening matching, dial-by-name
  matching, etc.
- Trace data structures are simple arrays/strings — JSON-equality is
  achievable in tests.

## 13. Where each PortaOne concept lives in code

A reverse map for orientation.

| PortaOne concept | Implementation |
|---|---|
| ROOT / sub-menu | `menu_root`, `menu_custom` schemas + `runMenu` |
| Menu actions / no_input / fax events | `MenuInputKeySchema`, `menu.actions[key]` |
| Active period (Always / time interval) | `ActivePeriodSchema` + `entity.time_periods` + `isPeriodActive` |
| When inactive → alternative menu | `menu.inactive_action_node_id` |
| Intro / Menu prompts | `menu.intro_prompt` / `menu.menu_prompt` + `playPrompt` |
| Per-action "Play Before Action" | `MenuActionTarget.play_before_action` |
| Input errors / max retries / aa_timeout / aa_disabled / max_fails | `menu.max_input_errors`, `on_timeout_prompt`, `on_unavailable_prompt`, `max_fails_prompt`, retry loop in `consumeInput` |
| Allow direct extension dial / interdigit timeout | `menu.allow_direct_dial`, `menu.interdigit_timeout_s`, direct-dial collector in `consumeInput` |
| Dial-by-name "published" flag | `ExtensionDirectoryEntry.published` |
| Announce extension numbers | `action_dial_by_name.announce_extensions` |
| Max Size / Max digits | `action_prompt_extension.max_digits`, `action_dial_direct.max_digits` |
| Preferred IVR language | `entity.preferred_ivr_language` |
| Default answering mode (Ext) — 8 modes | `answering_mode_ext.mode` + `runExtAnsweringMode` |
| Default answering mode (AA) — 8 modes | `answering_mode_aa.mode` + dispatch in `runAutoAttendant` |
| Simple / Follow-me / SIP URI / Advanced forwarding | `forward_simple`, `forward_follow_me`, `forward_sip_uri`, `forward_advanced` |
| Distribution modes (sequential / simultaneous / random / percentage) | `RingModeSchema` + `goForwardExt` dispatch |
| Per-rule SIP proxy override | `ForwardRule.sip_proxy` |
| Per-rule percentage weight | `ForwardRule.percentage_weight` |
| Keep Original CLD | `forward_advanced.keep_original_cld` (stored, not yet surfaced in trace) |
| Visible call forward info (Display Name replace) | `*.replace_caller_id_name` (stored, not yet surfaced in trace) |
| Simultaneous CANCEL reason | Emitted as a `CANCEL → ... (call completed elsewhere)` trace step |
| Voicemail greeting / email options | `voicemail.{greeting, email_option, email_address}` |
| Fax mailbox | `fax_mailbox` |
| Call recording (MR129 — automatic / on-demand, dual announce, format, privacy, transcription) | `call_recording.{mode, allow_manual_start_stop, start_dtmf_code, stop_dtmf_code, announce_to_all, announce_started_prompt, announce_stopped_prompt, auto_record_incoming, auto_record_redirected, format, send_to_email, private_to_owner, enable_transcription}` + `applyRecordingIfConfigured` (see §7.5) |
| Extension screening rules | `screening_rule` + `runExtension` first-pass |
| Hunt group reference / call queue reference | `target_hunt_group_ref`, `action_queue` (referenced only — flows out of MVP scope) |

## 14. Known gaps from the docs

- **Hunt Group as a first-class entity.** Members, ring policy
  (sequential / simultaneous / round-robin), wrap-up time, diversion
  inhibitor — none modelled. Only the reference exists.
- **Call Queue as a first-class flow.** Same.
- **PortaSwitch billing / xDR semantics.** Out of scope for an editor.
- **Endpoint-redirect (302 SIP from the phone)** — service-policy toggle,
  not flow logic.
- **Permitted SIP Proxies allowlist.** Tenant-level admin policy.
- **Recursive follow-me chaining** across multiple SIP accounts (A→B→C→D).
  The simulator handles a single hop per entity; multi-entity chained
  flows would need a multi-entity workspace, not a model change.
- **Per-rule SIP proxy** in the simulator. Stored, not yet annotated in
  the trace.
- **`keep_original_cld` / `replace_caller_id_name`** annotation. Stored,
  not yet annotated in the trace.
- **Recurrence rules.** Time periods are component-based. iCalendar
  RRULE ("last Friday of the month", "Easter ± 1 day") is a separate
  effort.
- **Per-entity timezone.** Wall-clock parsing assumes the admin's intent
  matches the literal hours in the ISO string. Multi-region tenants
  would want explicit IANA TZ on the entity.
