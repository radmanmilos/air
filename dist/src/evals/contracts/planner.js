import { z } from 'zod';
import { PlanSchema } from '../../planner/index.js';
export const PLANNER_SCHEMA = PlanSchema;
export const PLANNER_JSON_SCHEMA = z.toJSONSchema(PlanSchema);
export function plannerFormat() {
    return PLANNER_JSON_SCHEMA;
}
