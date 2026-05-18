import { z } from "zod";
import {
  ActivePeriodSchema,
  AnsweringModeAaSchema,
  AnsweringModeExtSchema,
  E164Schema,
  EmailSchema,
  ExtensionNumberSchema,
  IncomingCallModeSchema,
  MenuInputKeySchema,
  PromptIdSchema,
  SipUriSchema,
  VoicemailEmailOptionSchema,
  VoicemailGreetingSchema,
} from "./primitives";

const optionalNonEmpty = z.string().min(1).optional();

export const IncomingCallDataSchema = z.object({
  label: z.string().default("Incoming Call"),
  did: E164Schema.optional(),
});

export const OutgoingCallDataSchema = z.object({
  label: z.string().default("Outgoing Call"),
  barred_categories: z.array(z.string()).default([]),
  record: z.boolean().default(false),
  record_announce_prompt: optionalNonEmpty,
  record_send_to_email: EmailSchema.optional(),
  unblock_code_required: z.boolean().default(false),
});

const NoInputSchema = z.object({
  timeout_s: z.number().int().min(1).max(60).default(9),
  action_node_id: z.string().optional(),
});

export const MenuActionTargetSchema = z.object({
  target_node_id: z.string().min(1),
  play_before_action: PromptIdSchema.optional(),
});

export const MenuRootDataSchema = z.object({
  name: z.literal("ROOT").default("ROOT"),
  // Per PortaOne docs: ROOT may be set to "Always" OR a specific time interval; the
  // alternative-menu chain handles inactivity. Keep name locked but allow custom period.
  active_period: ActivePeriodSchema.default("always"),
  intro_prompt: PromptIdSchema.optional(),
  menu_prompt: PromptIdSchema.optional(),
  no_input: NoInputSchema.default({ timeout_s: 9 }),
  allow_direct_dial: z.boolean().default(false),
  interdigit_timeout_s: z.number().int().min(1).max(30).default(5),
  inactive_action_node_id: z.string().optional(),
  actions: z.record(MenuInputKeySchema, MenuActionTargetSchema).default({}),
  // Input-error retry loop (matches the PortaSwitch flowchart).
  max_input_errors: z.number().int().min(1).max(10).optional(),
  on_timeout_prompt: PromptIdSchema.optional(),
  on_unavailable_prompt: PromptIdSchema.optional(),
  max_fails_prompt: PromptIdSchema.optional(),
});

export const MenuCustomDataSchema = MenuRootDataSchema.extend({
  name: z.string().min(1),
});

export const ActionTransferDataSchema = z.object({
  target_node_id: z.string().min(1).optional(),
  play_before_action: PromptIdSchema.optional(),
});

export const ActionTransferE164DataSchema = z.object({
  number: E164Schema.optional(),
  play_before_action: PromptIdSchema.optional(),
});

export const ActionPromptExtensionDataSchema = z.object({
  prompt: PromptIdSchema.optional(),
  timeout_s: z.number().int().min(1).max(30).default(5),
  /** Upper bound on digits the caller can enter (PortaOne "Max Size"). */
  max_digits: z.number().int().min(1).max(10).optional(),
});

export const ActionDialDirectDataSchema = z.object({
  first_digit: z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]).optional(),
  /** Upper bound on digits including the triggering first digit. */
  max_digits: z.number().int().min(1).max(10).optional(),
});

export const ActionVoicemailDataSchema = z.object({
  mailbox_node_id: z.string().min(1).optional(),
  play_before_action: PromptIdSchema.optional(),
});

export const ActionDialByNameDataSchema = z.object({
  prompt: PromptIdSchema.optional(),
  /** When true, the IVR announces the matched extension number before transferring. */
  announce_extensions: z.boolean().optional(),
});

export const ActionDisconnectDataSchema = z.object({
  play_before_action: PromptIdSchema.optional(),
});

export const ActionDisaDataSchema = z.object({
  password_prompt: PromptIdSchema.optional(),
});

export const ActionQueueDataSchema = z.object({
  queue_name: z.string().min(1).optional(),
});

export const ActionGotoMenuDataSchema = z.object({
  target_menu_node_id: z.string().min(1).optional(),
});

export const ActionNopDataSchema = z.object({
  /**
   * Optional prompt to play after the no-op (e.g., "this option is intentionally
   * disabled"). The simulator returns the caller to the parent menu either way.
   */
  prompt: PromptIdSchema.optional(),
});

export const AnsweringModeExtDataSchema = z.object({
  mode: AnsweringModeExtSchema.default("ring_only"),
  ring_timeout_s: z.number().int().min(1).max(120).default(20),
  reject_sip_code: z.number().int().min(400).max(699).default(486),
  forward_node_id: z.string().optional(),
  voicemail_node_id: z.string().optional(),
});

export const AnsweringModeAaDataSchema = z.object({
  mode: AnsweringModeAaSchema.default("ivr_only"),
  ring_timeout_s: z.number().int().min(1).max(120).default(20),
  reject_sip_code: z.number().int().min(400).max(699).default(486),
  forward_node_id: z.string().optional(),
  ivr_menu_node_id: z.string().optional(),
});

export const RingModeSchema = z.enum([
  "sequential",
  "simultaneous",
  "random",
  "percentage",
]);
export type RingMode = z.infer<typeof RingModeSchema>;

const ForwardRuleSchema = z.object({
  id: z.string().min(1),
  target_node_id: z.string().min(1),
  time_check: ActivePeriodSchema.default("always"),
  timeout_s: z.number().int().min(1).max(120).default(20),
  enabled: z.boolean().default(true),
  sip_proxy: optionalNonEmpty,
  /** Used only when the forwarding node's ring_mode is "percentage". */
  percentage_weight: z.number().int().min(0).max(100).optional(),
});

export const ForwardFollowMeDataSchema = z.object({
  ring_mode: RingModeSchema.default("sequential"),
  rules: z.array(ForwardRuleSchema).default([]),
  /** Replace the SIP "Display Name" of the caller with info identifying the forwarder. */
  replace_caller_id_name: z.boolean().default(false),
});

export const ForwardAdvancedDataSchema = z.object({
  ring_mode: RingModeSchema.default("sequential"),
  rules: z.array(ForwardRuleSchema).default([]),
  /** Preserve the originally-dialed DID in the To: header when forwarding. */
  keep_original_cld: z.boolean().default(false),
  replace_caller_id_name: z.boolean().default(false),
});

export const ForwardSipUriDataSchema = z.object({
  target_uri: SipUriSchema.optional(),
  sip_proxy: optionalNonEmpty,
  timeout_s: z.number().int().min(1).max(120).default(20),
});

export const ForwardSimpleDataSchema = z.object({
  target_number: z.union([E164Schema, ExtensionNumberSchema]).optional(),
  timeout_s: z.number().int().min(1).max(120).default(20),
});

const ScreeningConditionSchema = z.object({
  time_period: ActivePeriodSchema.default("always"),
  caller: z
    .object({
      kind: z.enum(["any", "number", "prefix", "regex", "anonymous", "caller_list"]),
      value: z.string().optional(),
    })
    .default({ kind: "any" }),
  callee: z
    .object({
      kind: z.enum(["any", "did", "alias"]),
      value: z.string().optional(),
    })
    .default({ kind: "any" }),
  mode: IncomingCallModeSchema.optional(),
});

export const ScreeningRuleDataSchema = z.object({
  name: z.string().min(1).default("Rule"),
  order: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
  conditions: ScreeningConditionSchema.default({
    time_period: "always",
    caller: { kind: "any" },
    callee: { kind: "any" },
  }),
  action_mode: AnsweringModeExtSchema.default("voicemail_only"),
  play_before_action: PromptIdSchema.optional(),
});

export const VoicemailDataSchema = z.object({
  greeting: VoicemailGreetingSchema.default("standard"),
  require_pin: z.boolean().default(true),
  auto_play: z.boolean().default(false),
  announce_datetime: z.boolean().default(true),
  email_option: VoicemailEmailOptionSchema.default("none"),
  email_address: EmailSchema.optional(),
});

export const FaxMailboxDataSchema = z.object({
  email_option: VoicemailEmailOptionSchema.default("forward_as_attachment"),
  email_address: EmailSchema.optional(),
});

export const CallRecordingDataSchema = z.object({
  announce: z.boolean().default(true),
  announce_prompt: PromptIdSchema.optional(),
  send_to_email: EmailSchema.optional(),
});

export const CondTimeDataSchema = z.object({
  period: ActivePeriodSchema.default("always"),
});

export const CondCallerDataSchema = z.object({
  kind: z.enum(["number", "prefix", "regex", "anonymous", "caller_list"]).default("number"),
  value: optionalNonEmpty,
});

export const CondCalleeDataSchema = z.object({
  kind: z.enum(["did", "alias"]).default("did"),
  value: optionalNonEmpty,
});

export const CondModeDataSchema = z.object({
  mode: IncomingCallModeSchema.default("business_hours"),
});

export const TargetExtensionDataSchema = z.object({
  extension: ExtensionNumberSchema,
});

export const TargetHuntGroupRefDataSchema = z.object({
  hunt_group_id: z.string().min(1),
  label: z.string().min(1).optional(),
});

export const TargetExternalDataSchema = z.object({
  number: E164Schema,
});

export const TargetSipUriDataSchema = z.object({
  uri: SipUriSchema,
});

export const TerminalDataSchema = z.object({
  label: z.string().optional(),
});
