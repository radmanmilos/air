export interface JobFacts {
    runId: string;
    result: string;
    adapterId: string;
    provider: string;
    model: string;
    durationMs?: number;
    changedFiles?: string[];
    verifyOk?: boolean;
    outputTail?: string;
    error?: {
        category: string;
        message: string;
    };
    verbose?: boolean;
}
export declare function compileJobResult(facts: JobFacts): string;
