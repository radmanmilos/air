import { z } from 'zod';
import { PlanSchema } from '../../planner';

export const PLANNER_SCHEMA = PlanSchema;
export const PLANNER_JSON_SCHEMA = z.toJSONSchema(PlanSchema) as Record<string, unknown>;

export function plannerFormat() {
  return PLANNER_JSON_SCHEMA;
}
