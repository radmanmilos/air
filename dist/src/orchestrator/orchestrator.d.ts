export interface OrchestratorHandle {
    cancel: () => void;
    promise: Promise<OrchestratorSession>;
}
export interface OrchestratorEvent {
    id: string;
    sequence: number;
    ts: string;
    type: string;
    detail: string;
    conversationId?: string;
    workId?: string;
    workItemId?: string;
    executionId?: string;
    actor?: string;
}
export interface OrchestratorSession {
    runId: string;
    task: string;
    cwd: string;
    adapterId: string;
    provider: string;
    model: string;
    readOnly: boolean;
    state: string;
    startedAt: string;
    endedAt?: string;
    result?: string;
    parentRunId?: string;
    proposedSwitch?: any;
    taskInputPrompt?: string;
    visitedKeys?: string[];
    hops?: number;
    allowProviders?: string[];
    allowModels?: string[];
}
export interface OrchestratorDeps {
    adapters?: any[];
    config?: any;
    cacheDir?: string;
    /** Called when a failover is proposed in ask mode. Return true to approve
     *  and continue the loop, false to decline. In MCP mode this sets state to
     *  AWAITING_APPROVAL and returns false so the MCP client can approve later. */
    onFailoverPropose?: (proposal: any) => Promise<boolean>;
    mcpMode?: boolean;
}
export declare class Orchestrator {
    private deps;
    private sessions;
    private handles;
    private events;
    private logFile;
    constructor(deps?: OrchestratorDeps);
    private load;
    private persist;
    private log;
    get eventsLog(): OrchestratorEvent[];
    chooseAdapter(task: {
        mode: 'ask' | 'auto';
        readOnly: boolean;
    }): any | null;
    /**
     * Run a task through the full failover loop.
     *
     * Single execution path shared by CLI and MCP:
     *   1. Dirty-tree check (refuse write tasks on dirty tree unless --allow-dirty)
     *   2. Select candidate (priority list, cooldowns, skip reasons)
     *   3. Run process via shared runner
     *   4. Classify error, update health/cooldowns
     *   5. Compute result from workspace delta (not stdout)
     *   6. On failover-triggering category: propose switch (ask) or auto-switch
     *   7. Repeat until success, abort, hop cap, or no eligible candidate
     */
    start(task: string, cwd: string, options?: {
        runId?: string;
        controller?: AbortController;
        freeOnly?: boolean;
        readOnly?: boolean;
        mode?: 'ask' | 'auto';
        files?: string[];
        maxHops?: number;
        allowDirty?: boolean;
        allowProviders?: string[];
    }): Promise<OrchestratorSession>;
    /**
     * Resume a paused failover loop after failover approval (MCP mode).
     * Continues from the saved continuation state (visited keys, hops, allow
     * lists, task prompt) and switches to the proposed adapter.
     */
    resumeAfterApproval(runId: string): Promise<OrchestratorSession>;
    /**
     * Handle a failover proposal. In MCP mode, set state to AWAITING_APPROVAL
     * and return false so the MCP client can approve later via approve_failover.
     * In CLI mode, use the onFailoverPropose callback (interactive prompt).
     */
    private handleFailoverProposal;
    /** Interactive approval prompt for a failover proposal (R5-04). */
    private promptApproveFailover;
    list(): OrchestratorSession[];
    get(runId: string): OrchestratorSession | undefined;
    waitFor(runId: string): Promise<OrchestratorSession>;
    resume(runId: string, taskOverride?: string): Promise<OrchestratorSession>;
    waitForAll(): Promise<void>;
    cancel(runId: string): Promise<void>;
}
