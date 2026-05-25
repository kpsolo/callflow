import { z } from "zod";
import { E164Schema, ExtensionNumberSchema } from "./primitives";
import { TimePeriodMapSchema } from "./timePeriod";

export const ExtensionDirectoryEntrySchema = z.object({
  extension: ExtensionNumberSchema,
  name: z.string().min(1),
  published: z.boolean().default(true),
});
export type ExtensionDirectoryEntry = z.infer<typeof ExtensionDirectoryEntrySchema>;

export const AutoAttendantEntitySchema = z.object({
  type: z.literal("auto_attendant"),
  id: z.string().min(1),
  did: E164Schema,
  name: z.string().min(1),
  directory: z.array(ExtensionDirectoryEntrySchema).default([]),
  time_periods: TimePeriodMapSchema.optional(),
  /** Preferred IVR language (ISO 639-1 code, e.g. "en", "fr", "es"). */
  preferred_ivr_language: z.string().optional(),
  /** Regional IANA Time Zone for time periods (e.g. "America/New_York"). */
  timezone: z.string().optional(),
});
export type AutoAttendantEntity = z.infer<typeof AutoAttendantEntitySchema>;

export const ExtensionEntitySchema = z.object({
  type: z.literal("extension"),
  id: z.string().min(1),
  extension: ExtensionNumberSchema,
  name: z.string().min(1),
  time_periods: TimePeriodMapSchema.optional(),
  preferred_ivr_language: z.string().optional(),
  /** Regional IANA Time Zone for time periods (e.g. "America/New_York"). */
  timezone: z.string().optional(),
});
export type ExtensionEntity = z.infer<typeof ExtensionEntitySchema>;

export const EntitySchema = z.discriminatedUnion("type", [
  AutoAttendantEntitySchema,
  ExtensionEntitySchema,
]);
export type Entity = z.infer<typeof EntitySchema>;
