import type { FlowNode, NodeKind, NodeOf } from "@/schema";

type SummaryFn<K extends NodeKind> = (data: NodeOf<K>["data"]) => React.ReactNode;

const summaries: { [K in NodeKind]?: SummaryFn<K> } = {
  incoming_call: (d) => <Row k="DID" v={d.did ?? "—"} />,
  outgoing_call: (d) => (
    <>
      <Row k="Barred" v={d.barred_categories.length ? d.barred_categories.join(", ") : "none"} />
      <Row k="Record" v={d.record ? "on" : "off"} />
    </>
  ),
  menu_root: (d) => (
    <>
      <Row k="Active" v={d.active_period} />
      <Row k="Direct-dial" v={d.allow_direct_dial ? "on" : "off"} />
      <Row k="Inputs" v={Object.keys(d.actions).length || "—"} />
    </>
  ),
  menu_custom: (d) => (
    <>
      <Row k="Name" v={d.name} />
      <Row k="Active" v={d.active_period} />
      <Row k="Inputs" v={Object.keys(d.actions).length || "—"} />
    </>
  ),
  action_transfer_e164: (d) => <Row k="Number" v={d.number ?? "—"} />,
  action_prompt_extension: (d) => <Row k="Timeout" v={`${d.timeout_s}s`} />,
  action_dial_direct: (d) => <Row k="Digit" v={d.first_digit ?? "—"} />,
  action_queue: (d) => <Row k="Queue" v={d.queue_name ?? "—"} />,
  answering_mode_ext: (d) => (
    <>
      <Row k="Mode" v={d.mode} />
      <Row k="Ring" v={`${d.ring_timeout_s}s`} />
    </>
  ),
  answering_mode_aa: (d) => (
    <>
      <Row k="Mode" v={d.mode} />
      <Row k="Ring" v={`${d.ring_timeout_s}s`} />
    </>
  ),
  forward_follow_me: (d) => <Row k="Rules" v={d.rules.length} />,
  forward_advanced: (d) => (
    <>
      <Row k="Ring" v={d.ring_mode} />
      <Row k="Rules" v={d.rules.length} />
    </>
  ),
  forward_sip_uri: (d) => <Row k="URI" v={d.target_uri ?? "—"} />,
  forward_simple: (d) => <Row k="To" v={d.target_number ?? "—"} />,
  screening_rule: (d) => (
    <>
      <Row k="Name" v={d.name} />
      <Row k="Time" v={d.conditions.time_period} />
      <Row k="Caller" v={`${d.conditions.caller.kind}${d.conditions.caller.value ? ` (${d.conditions.caller.value})` : ""}`} />
      <Row k="Action" v={d.action_mode} />
    </>
  ),
  voicemail: (d) => (
    <>
      <Row k="Greeting" v={d.greeting} />
      <Row k="Email" v={d.email_option} />
    </>
  ),
  fax_mailbox: (d) => <Row k="Email" v={d.email_option} />,
  call_recording: (d) => <Row k="Announce" v={d.announce ? "yes" : "no"} />,
  cond_time: (d) => <Row k="Period" v={d.period} />,
  cond_caller: (d) => <Row k="Kind" v={`${d.kind}${d.value ? ` (${d.value})` : ""}`} />,
  cond_callee: (d) => <Row k="Kind" v={`${d.kind}${d.value ? ` (${d.value})` : ""}`} />,
  cond_mode: (d) => <Row k="Mode" v={d.mode} />,
  target_extension: (d) => <Row k="Ext" v={d.extension} />,
  target_hunt_group_ref: (d) => <Row k="HG" v={d.label ?? d.hunt_group_id} />,
  target_external: (d) => <Row k="Number" v={d.number} />,
  target_sip_uri: (d) => <Row k="URI" v={d.uri} />,
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fn-node-row">
      <strong>{k}</strong> <span>{v}</span>
    </div>
  );
}

export function renderSummary<K extends NodeKind>(kind: K, data: FlowNode["data"]): React.ReactNode {
  const fn = summaries[kind] as SummaryFn<K> | undefined;
  if (!fn) return null;
  return fn(data as NodeOf<K>["data"]);
}
