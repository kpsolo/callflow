import { z } from "zod";

export const PromptIdSchema = z.string().min(1);
export type PromptId = z.infer<typeof PromptIdSchema>;

export const ExtensionNumberSchema = z.string().regex(/^\d{1,10}$/, "Digits only, 1–10 chars");
export type ExtensionNumber = z.infer<typeof ExtensionNumberSchema>;

export const E164Schema = z.string().regex(/^\+?[1-9]\d{6,14}$/, "Invalid E.164 number");
export type E164 = z.infer<typeof E164Schema>;

export const SipUriSchema = z.string().regex(/^sips?:[^\s]+$/, "Invalid SIP URI");
export type SipUri = z.infer<typeof SipUriSchema>;

export const ActivePeriodSchema = z.union([z.literal("always"), z.string().min(1)]);
export type ActivePeriod = z.infer<typeof ActivePeriodSchema>;

export const EmailSchema = z.string().email();

export const VoicemailEmailOptionSchema = z.enum([
  "none",
  "forward",
  "forward_as_attachment",
  "copy",
  "notify",
]);
export type VoicemailEmailOption = z.infer<typeof VoicemailEmailOptionSchema>;

export const VoicemailGreetingSchema = z.enum([
  "standard",
  "personal",
  "name",
  "extended_absence",
]);
export type VoicemailGreeting = z.infer<typeof VoicemailGreetingSchema>;

export const RingPolicySchema = z.enum(["sequential", "simultaneous", "round_robin"]);
export type RingPolicy = z.infer<typeof RingPolicySchema>;

export const AnsweringModeExtSchema = z.enum([
  "ring_forward_voicemail",
  "ring_then_forward",
  "ring_then_voicemail",
  "forward_then_voicemail",
  "ring_only",
  "forward_only",
  "voicemail_only",
  "reject",
]);
export type AnsweringModeExt = z.infer<typeof AnsweringModeExtSchema>;

export const AnsweringModeAaSchema = z.enum([
  "ring_forward_ivr",
  "ring_then_forward",
  "ring_then_ivr",
  "forward_then_ivr",
  "ring_only",
  "forward_only",
  "ivr_only",
  "reject",
]);
export type AnsweringModeAa = z.infer<typeof AnsweringModeAaSchema>;

export const IncomingCallModeSchema = z.string().min(1);

export const MenuInputKeySchema = z.union([
  z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"]),
  z.enum(["fax", "no_input"]),
]);
export type MenuInputKey = z.infer<typeof MenuInputKeySchema>;

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;
