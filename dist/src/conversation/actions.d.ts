import { z } from 'zod';
export declare const ActionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type Action = z.infer<typeof ActionSchema>;
export declare function parseActions(raw: unknown): Action[];
