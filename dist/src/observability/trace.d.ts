/** Configure rotation limits. Idempotent. */
export declare function configureTrace(options?: {
    maxBytes?: number;
    maxBackups?: number;
}): void;
export interface TraceEvent {
    event: string;
    runId?: string;
    ts?: string;
    [key: string]: unknown;
}
export declare function trace(event: TraceEvent): void;
