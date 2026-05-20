# Call Flow Studio: User Stories & Scenarios (CloudPBX Admin)

This document outlines the core user stories and usage scenarios for a **CloudPBX Administrator** managing call routing and interactive voice response (IVR) systems using the Call Flow Studio. These stories and scenarios serve to align design aesthetics, logical execution flows, and node structures with real-world admin workflows.

---

## 1. User Stories

### Story 1: Dynamic Schedules & Holiday Overrides (Auto Attendant)
*   **As a** CloudPBX Admin,
*   **I want to** configure distinct call routing logic for standard business hours, after-hours, and national holidays,
*   **So that** inbound callers receive accurate greetings and are routed to active departments during operating hours, or sent to emergency support and voicemail during closures.
*   **Key Node Types**: `incoming_call`, `answering_mode_aa`, `menu_root`, `cond_time`, `action_transfer`, `voicemail`.

### Story 2: Flexible Call Forwarding & Escalation (Extension Answering)
*   **As a** CloudPBX Admin,
*   **I want to** configure complex forwarding (Follow-Me) rules for remote and hybrid employees—trying their SIP softphones first, then their mobile numbers simultaneously, and finally falling back to a shared voicemail box,
*   **So that** customer calls are never missed, and employees are not disturbed outside their specific working windows.
*   **Key Node Types**: `answering_mode_ext`, `forward_follow_me`, `forward_advanced`, `target_external`, `voicemail`, `term_forwarded_answered`.

### Story 3: Call Recording Compliance & Side-Effects (Recording)
*   **As a** CloudPBX Admin,
*   **I want to** enforce automated call recording on certain high-liability queues, while permitting on-demand recording toggles (via DTMF codes) for standard support reps, complete with automated AI transcriptions and email delivery,
*   **So that** the organization complies with local financial/telephony regulations and simplifies quality assurance reviews.
*   **Key Node Types**: `call_recording`, `term_answered`, `outgoing_call`.

### Story 4: Intelligent Call Screening & Spam Prevention (Screening)
*   **As a** CloudPBX Admin,
*   **I want to** build an ordered sequence of filtering rules that match caller IDs (using direct matches, prefixes, or regex patterns) to block known spam numbers, anonymous calls, or fast-track VIP clients directly to account managers,
*   **So that** agents are protected from cold calls and VIP customers receive immediate, high-priority service.
*   **Key Node Types**: `screening_rule`, `term_rejected`, `cond_caller`, `action_transfer`.

### Story 5: Self-Service Navigation (Direct Dialing & Dial-By-Name)
*   **As a** CloudPBX Admin,
*   **I want to** allow callers to bypass IVR menus entirely by either typing the extension number directly (Direct Dial) or spelling out the first three letters of an employee's name on their keypad (Dial-by-Name),
*   **So that** regular callers can reach their intended contacts rapidly without wading through deep menu trees.
*   **Key Node Types**: `menu_root`, `action_dial_by_name`, `action_prompt_extension`, `target_extension`.

---

## 2. Realistic Usage Scenarios

### Scenario A: "Seasonal Holiday Shutdown & Emergency Escalation"
*   **Background**: Acme Corp is closing for the winter holidays (Dec 24 to Jan 2). The admin needs to configure the main incoming DID (+1-800-555-7890) to bypass the standard Sales/Support menus. Instead, it must play a custom "Holiday Closure" greeting. Callers pressing `9` should still be routed to the Emergency On-Call Hunt Group, while others should be directed to the general voicemail box.
*   **Step-by-Step Flow**:
    1.  The admin defines a new **Time Period** named `winter_holidays` spanning `Months = [12, 1]`, `Days of Month = [24..31, 1..2]`.
    2.  An `incoming_call` node is connected to a `cond_time` node set to `period = "winter_holidays"`.
    3.  **True Path**: Routes to a `menu_custom` node named "Holiday Menu" which plays `holiday_intro_prompt` ("Acme is closed for the holidays...").
        *   Pressing `9` routes to an `action_transfer` node pointing to `target_hunt_group_ref` (Emergency Group).
        *   No-input/Timeout or any other key routes to a general `voicemail` box.
    4.  **False Path**: Routes to the standard `menu_root` node, which proceeds with standard business-hour branching (Sales on 1, Support on 2).
*   **Visual Canvas Benefits**: By looking at the canvas, the admin immediately sees the `cond_time` fork. They can run a **Simulator Scenario** with the system time set to "December 25th" to visually verify that the simulator lights up the "Holiday Menu" path and correctly handles key `9`.

### Scenario B: "The Hybrid Sales Executive (Follow-Me & SIP URI)"
*   **Background**: John, a Senior Sales Executive, works on-site on Mondays/Tuesdays, remotely on Wednesdays/Thursdays, and is off on Fridays. When customers call John's extension (104):
    *   *Mon-Tue*: His desk phone (`target_extension` 104) should ring for 15 seconds.
    *   *Wed-Thu*: His softphone (`forward_sip_uri` to John's home SIP proxy) and mobile phone (`target_external`) should ring *simultaneously* for 20 seconds.
    *   *Fri/After-Hours/No Answer*: Call must fall back to John's `voicemail` box.
*   **Step-by-Step Flow**:
    1.  An extension call lands on John's `answering_mode_ext` set to `ring_forward_voicemail`.
    2.  The `ring` port connects to John's primary `target_extension` (104).
    3.  If ringing times out, the call enters a `forward_follow_me` node.
    4.  The `forward_follow_me` contains two configured rules in `sequential` mode:
        *   **Rule 1 (Office Schedule)**: Active only on `days_of_week = [1, 2]`. Redirects to desk phone extension.
        *   **Rule 2 (Remote Schedule)**: Active only on `days_of_week = [3, 4]`. The distribution is set to `simultaneous`, ringing John's SIP URI (`sip:john@home.sip`) and his external cell phone (`+1-206-555-9012`).
    5.  If John does not pick up either leg, the `unanswered` port of the forwarding node directs the call to John's `voicemail` box.
*   **Visual Canvas Benefits**: Standard PBX screens separate these rules into three tabs. Call Flow Studio aggregates John's schedule, SIP endpoints, and voicemail failover into one clean, left-to-right visual chain.

### Scenario C: "E-Commerce VIP Priority & Auto-Spam Deflector"
*   **Background**: A retail business is getting flooded with anonymous robotic spam, which exhausts their hunt-group channels. Simultaneously, they want to ensure their highest-value VIP partners (using the phone prefix `+1-888-VIP-*`) bypass the IVR queue completely and ring the VIP support team directly.
*   **Step-by-Step Flow**:
    1.  The `incoming_call` node connects directly to a series of `screening_rule` nodes.
    2.  **Rule 1 (VIP Whitelist)**: Matches `caller.kind = "prefix"` with `value = "+1888"`. If matched, `action_mode` is set to `forward_only` which connects to `target_hunt_group_ref` (VIP Team).
    3.  **Rule 2 (Spam Blacklist)**: Matches `caller.kind = "anonymous"`. If matched, `action_mode` is set to `reject` with SIP Code `603 Decline`, routing directly to the `term_rejected` terminal node.
    4.  **Rule 3 (General Rule)**: Matches any caller. Routes to `answering_mode_aa` to kick off the regular interactive menu.
*   **Visual Canvas Benefits**: Admins can easily drag rules up and down to change order of execution, with the canvas immediately updating the layout to show which rule filters are applied first.

### Scenario D: "Regulated Outbound Recording with Whisper Transcriptions"
*   **Background**: A brokerage firm requires all outbound sales calls to be recorded for legal audit. If an agent places an outbound call, the system must immediately play a compliance notice, record the entire conversation, convert it to highly compressed MP3 format, send the recording to `compliance@brokerage.com`, and run it through Whisper AI to produce a text transcript for CRM archiving.
*   **Step-by-Step Flow**:
    1.  The flow starts at the `outgoing_call` entry node.
    2.  `outgoing_call` is configured with `record = true` and connected to a `call_recording` node.
    3.  The `call_recording` node inspector is configured as follows:
        *   `mode = "automatic"`
        *   `announce_to_all = true` (plays the legal warning: "This call is recorded for quality purposes")
        *   `format = "mp3"` (minimizes storage costs)
        *   `send_to_email = "compliance@brokerage.com"`
        *   `enable_transcription = true` (flags the Whisper AI pipeline)
    4.  The output of the `call_recording` node connects to the dialed `target_external` endpoint.
*   **Visual Canvas Benefits**: Rather than configuring compliance scripts on each telephone device, the administrator sets a global, visual intercept policy. The simulator trace shows the exact progression: Call Outbound → Recording Started → Side-effect Emitted (Email Queued + Whisper Transcription Triggered) → Answered Leg.
