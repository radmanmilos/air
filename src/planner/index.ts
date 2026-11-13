import { z } from 'zod';

export const WorkItemSchema = z.object({
  id: z.string().min(1).max(64),
  objective: z.string().min(1).max(500),
  taskType: z.enum(['code_edit','code_review','explain','research','summarize','plan','test','other']),
  readOnly: z.boolean(),
  requiresWrite: z.boolean(),
  requiresCode: z.boolean(),
  dependsOn: z.array(z.string().min(1).max(64)).max(16),
  acceptanceCriteria: z.array(z.string().min(1).max(300)).min(1).max(16),
});

export const PlanSchema = z.object({ workItems: z.array(WorkItemSchema).min(1).max(32) });

export type TaskType = 'code_edit' | 'code_review' | 'explain' | 'research' | 'summarize' | 'plan' | 'test' | 'other';
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export interface PlanValidationResult {
  valid: boolean;
  plan?: Plan;
  errors: string[];
}

function hasCycle(items: WorkItem[]): boolean {
  const deps = new Map(items.map((i) => [i.id, i.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of deps.keys()) if (visit(id)) return true;
  return false;
}

export function validatePlanDetailed(input: unknown): PlanValidationResult {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'plan'}: ${i.message}`) };
  }
  const plan = parsed.data;
  const errors: string[] = [];
  const ids = plan.workItems.map((w) => w.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) errors.push('duplicate work item ids');
  const known = idSet;
  let totalDeps = 0;
  for (const item of plan.workItems) {
    if (item.dependsOn.includes(item.id)) errors.push(`self-dependency: ${item.id}`);
    for (const dep of item.dependsOn) {
      if (!known.has(dep)) errors.push(`unknown dependency: ${item.id} -> ${dep}`);
    }
    totalDeps += item.dependsOn.length;
  }
  if (totalDeps > 64) errors.push('dependency count exceeds limit');
  if (hasCycle(plan.workItems)) errors.push('dependency cycle detected');
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, plan, errors: [] };
}

export function validatePlan(plan: Plan): Plan {
  const result = validatePlanDetailed(plan);
  if (!result.valid || !result.plan) {
    throw new Error(result.errors.join('; ') || 'invalid plan');
  }
  return result.plan;
}

export interface PlanHints {
  requiresWrite?: boolean;
  requiresCode?: boolean;
  requiresLongContext?: boolean;
  maxDurationMs?: number;
}

export function planFromRequest(goal: string, hints: PlanHints = {}): Plan {
  const lower = goal.toLowerCase();
  const requiresWrite = hints.requiresWrite ?? /\b(fix|edit|modify|refactor|implement|add|create|change|write)\b/.test(lower);
  const requiresCode = hints.requiresCode ?? /\b(code|function|class|module|file|test)\b/.test(lower);
  const isReview = /\b(review|inspect|audit)\b/.test(lower);
  const isResearch = /\b(research|find|search|explain)\b/.test(lower) && !requiresWrite;

  const items: WorkItem[] = [];
  let id = 1;
  if (isReview) {
    items.push({ id: `w${id++}`, objective: `Inspect relevant code for: ${goal}`, taskType: 'code_review', readOnly: true, requiresWrite: false, requiresCode: true, dependsOn: [], acceptanceCriteria: ['identify relevant files'] });
  }
  if (requiresWrite) {
    items.push({ id: `w${id++}`, objective: goal, taskType: 'code_edit', readOnly: false, requiresWrite: true, requiresCode, dependsOn: isReview ? ['w1'] : [], acceptanceCriteria: ['changes applied', 'tests pass'] });
  }
  if (isResearch) {
    items.push({ id: `w${id++}`, objective: goal, taskType: 'research', readOnly: true, requiresWrite: false, requiresCode, dependsOn: [], acceptanceCriteria: ['answer provided'] });
  }
  if (items.length === 0) {
    items.push({ id: 'w1', objective: goal, taskType: 'other', readOnly: true, requiresWrite: false, requiresCode: false, dependsOn: [], acceptanceCriteria: ['respond'] });
  }
  return { workItems: items };
}
