export declare const EXIT_CODES: {
    readonly SUCCESS: 0;
    readonly NO_CHANGES: 1;
    readonly ALL_EXHAUSTED: 2;
    readonly USER_CANCELLED: 3;
    readonly CONFIG_OR_DIRTY: 4;
    readonly TIMEOUT: 5;
    readonly FAILOVER_PROPOSED: 6;
    readonly TASK_FAILURE: 7;
};
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
export declare function exitCodeFor(resultState: string, reason?: string): ExitCode;
export declare function formatExitCode(code: ExitCode): string;
