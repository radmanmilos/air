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
export declare function validatePlan(plan: Plan): Plan;
export type TaskType = 'code_edit' | 'code_review' | 'explain' | 'research' | 'summarize' | 'plan' | 'test' | 'other';
export interface WorkItem {
    id: string;
    objective: string;
    taskType: TaskType;
    readOnly: boolean;
    requiresWrite: boolean;
    requiresCode: boolean;
    dependsOn: string[];
    acceptanceCriteria: string[];
}
export interface Plan {
    workItems: WorkItem[];
}
export interface PlanHints {
    requiresWrite?: boolean;
    requiresCode?: boolean;
    requiresLongContext?: boolean;
    maxDurationMs?: number;
}
export declare function planFromRequest(goal: string, hints?: PlanHints): Plan;
