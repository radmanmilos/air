import { z } from 'zod';
export declare const ACTION_SCHEMA: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"answer">;
    text: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"spawn_job">;
    goal: z.ZodString;
    hints: z.ZodOptional<z.ZodObject<{
        requiresWrite: z.ZodOptional<z.ZodBoolean>;
        requiresCode: z.ZodOptional<z.ZodBoolean>;
        requiresLongContext: z.ZodOptional<z.ZodBoolean>;
        maxDurationMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"cancel_job">;
    jobId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"status">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"clarify">;
    question: z.ZodString;
}, z.core.$strip>], "type">;
export declare const ACTION_JSON_SCHEMA: Record<string, unknown>;
export declare function coordinatorFormat(): Record<string, unknown>;
