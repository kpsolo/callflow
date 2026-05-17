import { z } from "zod";

export const FlowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().optional().nullable(),
  target: z.string().min(1),
  targetHandle: z.string().optional().nullable(),
  label: z.string().optional(),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
