import { z } from "zod";
import { E164Schema, ExtensionNumberSchema, MenuInputKeySchema } from "./primitives";

export const ScenarioCallerSchema = z.union([
  E164Schema,
  z.literal("anonymous"),
  ExtensionNumberSchema,
]);

export const AnsweringBehaviorSchema = z.object({
  target: z.string().min(1),
  outcome: z.enum(["answer_after", "never_answer", "busy", "network_fail"]),
  after_ms: z.number().int().min(0).optional(),
});
export type AnsweringBehavior = z.infer<typeof AnsweringBehaviorSchema>;

export const ScenarioSchema = z.object({
  name: z.string().min(1),
  caller: ScenarioCallerSchema,
  callee: z.string().min(1),
  time: z.string().datetime({ offset: true }),
  active_mode: z.string().optional(),
  press_sequence: z.array(MenuInputKeySchema).default([]),
  answering_behavior: z.array(AnsweringBehaviorSchema).default([]),
  expected_terminal: z.string().optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
