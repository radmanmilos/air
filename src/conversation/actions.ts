// Front-agent action schema (T-025).
import { z } from 'zod';

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), text: z.string() }),
  z.object({ type: z.literal('spawn_job'), goal: z.string(), hints: z.object({
    requiresWrite: z.boolean().optional(),
    requiresCode: z.boolean().optional(),
    requiresLongContext: z.boolean().optional(),
    maxDurationMs: z.number().optional(),
  }).optional() }),
  z.object({ type: z.literal('cancel_job'), jobId: z.string() }),
  z.object({ type: z.literal('status') }),
  z.object({ type: z.literal('clarify'), question: z.string() }),
]);

export type Action = z.infer<typeof ActionSchema>;

export function parseActions(raw: unknown): Action[] {
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: Action[] = [];
  for (const a of arr) {
    const r = ActionSchema.safeParse(a);
    if (r.success) out.push(r.data);
  }
  return out;
}
