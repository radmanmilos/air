import { z } from 'zod';
import { ActionSchema } from '../../conversation/actions';

export const ACTION_SCHEMA = ActionSchema;
export const ACTION_JSON_SCHEMA = z.toJSONSchema(ActionSchema) as Record<string, unknown>;

export function coordinatorFormat() {
  return ACTION_JSON_SCHEMA;
}
