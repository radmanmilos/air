import { z } from 'zod';
export const WorkItemSchema = z.object({
    id: z.string(),
    objective: z.string(),
    taskType: z.enum(['code_edit', 'code_review', 'explain', 'research', 'summarize', 'plan', 'test', 'other']),
    readOnly: z.boolean(),
    requiresWrite: z.boolean(),
    requiresCode: z.boolean(),
    dependsOn: z.array(z.string()),
    acceptanceCriteria: z.array(z.string()),
});
export const PlanSchema = z.object({ workItems: z.array(WorkItemSchema) });
export function validatePlan(plan) {
    return PlanSchema.parse(plan);
}
export function planFromRequest(goal, hints = {}) {
    const lower = goal.toLowerCase();
    const requiresWrite = hints.requiresWrite ?? /\b(fix|edit|modify|refactor|implement|add|create|change|write)\b/.test(lower);
    const requiresCode = hints.requiresCode ?? /\b(code|function|class|module|file|test)\b/.test(lower);
    const isReview = /\b(review|inspect|audit)\b/.test(lower);
    const isResearch = /\b(research|find|search|explain)\b/.test(lower) && !requiresWrite;
    const items = [];
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
