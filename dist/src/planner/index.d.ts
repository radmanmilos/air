import { z } from 'zod';
export declare const WorkItemSchema: z.ZodObject<{
    id: z.ZodString;
    objective: z.ZodString;
    taskType: z.ZodEnum<{
        other: "other";
        code_edit: "code_edit";
        code_review: "code_review";
        explain: "explain";
        research: "research";
        summarize: "summarize";
        plan: "plan";
        test: "test";
    }>;
    readOnly: z.ZodBoolean;
    requiresWrite: z.ZodBoolean;
    requiresCode: z.ZodBoolean;
    dependsOn: z.ZodArray<z.ZodString>;
    acceptanceCriteria: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const PlanSchema: z.ZodObject<{
    workItems: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        objective: z.ZodString;
        taskType: z.ZodEnum<{
            other: "other";
            code_edit: "code_edit";
            code_review: "code_review";
            explain: "explain";
            research: "research";
            summarize: "summarize";
            plan: "plan";
            test: "test";
        }>;
        readOnly: z.ZodBoolean;
        requiresWrite: z.ZodBoolean;
        requiresCode: z.ZodBoolean;
        dependsOn: z.ZodArray<z.ZodString>;
        acceptanceCriteria: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TaskType = 'code_edit' | 'code_review' | 'explain' | 'research' | 'summarize' | 'plan' | 'test' | 'other';
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export interface PlanValidationResult {
    valid: boolean;
    plan?: Plan;
    errors: string[];
}
export declare function validatePlanDetailed(input: unknown): PlanValidationResult;
export declare function validatePlan(plan: Plan): Plan;
export interface PlanHints {
    requiresWrite?: boolean;
    requiresCode?: boolean;
    requiresLongContext?: boolean;
    maxDurationMs?: number;
}
export declare function planFromRequest(goal: string, hints?: PlanHints): Plan;
