import { z } from 'zod';
import { ActionSchema } from '../../conversation/actions.js';
export const ACTION_SCHEMA = ActionSchema;
export const ACTION_JSON_SCHEMA = z.toJSONSchema(ActionSchema);
export function coordinatorFormat() {
    return ACTION_JSON_SCHEMA;
}
