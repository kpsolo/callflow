import { z } from "zod";
import { EntitySchema } from "./entity";
import { FlowNodeSchema } from "./node";
import { FlowEdgeSchema } from "./edge";
import { ScenarioSchema } from "./scenario";

export const SCHEMA_VERSION = "1.0" as const;

export const FlowSchema = z.object({
  schema_version: z.string().regex(/^1\.\d+$/, "Only 1.x schemas are supported in this build"),
  entity: EntitySchema,
  nodes: z.array(FlowNodeSchema).default([]),
  edges: z.array(FlowEdgeSchema).default([]),
  scenarios: z.array(ScenarioSchema).default([]),
});
export type Flow = z.infer<typeof FlowSchema>;

export function emptyFlow(entity: z.infer<typeof EntitySchema>): Flow {
  return {
    schema_version: SCHEMA_VERSION,
    entity,
    nodes: [],
    edges: [],
    scenarios: [],
  };
}
