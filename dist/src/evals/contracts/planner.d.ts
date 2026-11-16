import { z } from 'zod';
export declare const PLANNER_SCHEMA: z.ZodObject<{
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
export declare const PLANNER_JSON_SCHEMA: Record<string, unknown>;
export declare function plannerFormat(): Record<string, unknown>;
