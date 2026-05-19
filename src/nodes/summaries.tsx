import type { FlowNode, NodeKind, NodeOf } from "@/schema";

type SummaryFn<K extends NodeKind> = (data: NodeOf<K>["data"]) => React.ReactNode;
type RowCountFn<K extends NodeKind> = (data: NodeOf<K>["data"]) => number;

const summaries: { [K in NodeKind]?: SummaryFn<K> } = {
  incoming_call: (d) => <Row k="DID" v={d.did ?? "—"} />,
  outgoing_call: (d) => (
    <>
      <Row k="Barred" v={d.barred_categories.length ? d.barred_categories.join(", ") : "none"} />
      <Row k="Record" v={<Bool v={d.record} />} />
    </>
  ),
  menu_root: (d) => (
    <>
      <Row k="Active" v={<PeriodChip v={d.active_period} />} />
      <Row k="Direct-dial" v={<Bool v={d.allow_direct_dial} />} />
      <Row k="Inputs" v={Object.keys(d.actions).length || "—"} />
    </>
  ),
  menu_custom: (d) => (
    <>
      <Row k="Name" v={d.name} />
      <Row k="Active" v={<PeriodChip v={d.active_period} />} />
      <Row k="Inputs" v={Object.keys(d.actions).length || "—"} />
    </>
  ),
  action_transfer: (d) => {
    if (d.mode === "extension") {
      return (
        <>
          <Row k="Mode" v={<Chip>Extension</Chip>} />
          <Row k="Target" v={d.extension ?? d.target_node_id ?? "—"} />
        </>
      );
    }
    if (d.mode === "hunt_group") {
      return (
        <>
          <Row k="Mode" v={<Chip>Hunt Group</Chip>} />
          <Row k="Target" v={d.hunt_group_id ?? "—"} />
        </>
      );
    }
    if (d.mode === "sip_uri") {
      return (
        <>
          <Row k="Mode" v={<Chip>SIP URI</Chip>} />
          <Row k="Target" v={d.uri ?? "—"} />
        </>
      );
    }
    return (
      <>
        <Row k="Mode" v={<Chip>E.164</Chip>} />
        <Row k="Number" v={d.number ?? "—"} />
      </>
    );
  },
  action_prompt_extension: (d) => <Row k="Timeout" v={`${d.timeout_s}s`} />,
  action_dial_direct: (d) => <Row k="Digit" v={d.first_digit ?? "—"} />,
  action_queue: (d) => <Row k="Queue" v={d.queue_name ?? "—"} />,
  answering_mode_ext: (d) => (
    <>
      <Row k="Mode" v={<Chip>{d.mode}</Chip>} />
      <Row k="Ring" v={`${d.ring_timeout_s}s`} />
    </>
  ),
  answering_mode_aa: (d) => (
    <>
      <Row k="Mode" v={<Chip>{d.mode}</Chip>} />
      <Row k="Ring" v={`${d.ring_timeout_s}s`} />
    </>
  ),
  forward_follow_me: (d) => <Row k="Rules" v={d.rules.length} />,
  forward_advanced: (d) => (
    <>
      <Row k="Ring" v={<Chip>{d.ring_mode}</Chip>} />
      <Row k="Rules" v={d.rules.length} />
    </>
  ),
  forward_sip_uri: (d) => <Row k="URI" v={d.target_uri ?? "—"} />,
  forward_simple: (d) => <Row k="To" v={d.target_number ?? "—"} />,
  screening_rule: (d) => (
    <>
      <Row k="Name" v={d.name} />
      <Row k="Time" v={<PeriodChip v={d.conditions.time_period} />} />
      <Row k="Caller" v={`${d.conditions.caller.kind}${d.conditions.caller.value ? ` (${d.conditions.caller.value})` : ""}`} />
      <Row k="Action" v={<Chip>{d.action_mode}</Chip>} />
    </>
  ),
  voicemail: (d) => (
    <>
      <Row k="Greeting" v={d.greeting} />
      <Row k="Email" v={<EmailOptionChip v={d.email_option} />} />
    </>
  ),
  fax_mailbox: (d) => <Row k="Email" v={<EmailOptionChip v={d.email_option} />} />,
  call_recording: (d) => <Row k="Announce" v={<Bool v={!!d.announce} onLabel="yes" offLabel="no" />} />,
  cond_time: (d) => <Row k="Period" v={<PeriodChip v={d.period} />} />,
  cond_caller: (d) => <Row k="Kind" v={`${d.kind}${d.value ? ` (${d.value})` : ""}`} />,
  cond_callee: (d) => <Row k="Kind" v={`${d.kind}${d.value ? ` (${d.value})` : ""}`} />,
  cond_mode: (d) => <Row k="Mode" v={<Chip>{d.mode}</Chip>} />,
  target_extension: (d) => <Row k="Ext" v={d.extension} />,
  target_hunt_group_ref: (d) => <Row k="HG" v={d.label ?? d.hunt_group_id} />,
  target_external: (d) => <Row k="Number" v={d.number} />,
  target_sip_uri: (d) => <Row k="URI" v={d.uri} />,
};

// Row counts mirror the structure of the summary functions above. Kept in lockstep
// so FlowNodeView can size the body section synchronously without DOM measurement.
const rowCounts: { [K in NodeKind]?: RowCountFn<K> } = {
  incoming_call: () => 1,
  outgoing_call: () => 2,
  menu_root: () => 3,
  menu_custom: () => 3,
  action_transfer: () => 2,
  action_prompt_extension: () => 1,
  action_dial_direct: () => 1,
  action_queue: () => 1,
  answering_mode_ext: () => 2,
  answering_mode_aa: () => 2,
  forward_follow_me: () => 1,
  forward_advanced: () => 2,
  forward_sip_uri: () => 1,
  forward_simple: () => 1,
  screening_rule: () => 4,
  voicemail: () => 2,
  fax_mailbox: () => 1,
  call_recording: () => 1,
  cond_time: () => 1,
  cond_caller: () => 1,
  cond_callee: () => 1,
  cond_mode: () => 1,
  target_extension: () => 1,
  target_hunt_group_ref: () => 1,
  target_external: () => 1,
  target_sip_uri: () => 1,
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <span className="fn-node-field__key">{k}</span>
      <span className="fn-node-field__value">{v}</span>
    </>
  );
}

type ChipTone = "neutral" | "on" | "off" | "warn";

function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: React.ReactNode }) {
  const cls = "fn-node-chip" + (tone === "neutral" ? "" : ` fn-node-chip--${tone}`);
  return <span className={cls}>{children}</span>;
}

function Bool({ v, onLabel = "on", offLabel = "off" }: { v: boolean; onLabel?: string; offLabel?: string }) {
  return <Chip tone={v ? "on" : "off"}>{v ? onLabel : offLabel}</Chip>;
}

function PeriodChip({ v }: { v: string }) {
  return <Chip tone={v === "always" ? "on" : "neutral"}>{v}</Chip>;
}

function EmailOptionChip({ v }: { v: string }) {
  return <Chip tone={v === "none" ? "off" : "neutral"}>{v}</Chip>;
}

export function renderSummary<K extends NodeKind>(kind: K, data: FlowNode["data"]): React.ReactNode {
  const fn = summaries[kind] as SummaryFn<K> | undefined;
  if (!fn) return null;
  return fn(data as NodeOf<K>["data"]);
}

export function summaryRowCount<K extends NodeKind>(kind: K, data: FlowNode["data"]): number {
  const fn = rowCounts[kind] as RowCountFn<K> | undefined;
  if (!fn) return 0;
  return fn(data as NodeOf<K>["data"]);
}
