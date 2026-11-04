import type { AgentAdapter } from '../adapters/adapter';
export interface SessionConfig {
    id: string;
    task: string;
    cwd: string;
    adapter: AgentAdapter;
    mode: 'ask' | 'auto';
    readOnly: boolean;
    files?: string[];
    maxHops?: number;
    timeoutMs?: number;
    maxConcurrentAgents?: number;
    isolated?: boolean;
    isolation?: 'none' | 'worktree' | string;
    worktree?: boolean;
}
export declare function assertSessionIsolation(configs: SessionConfig[]): void;
export interface SessionHandle {
    id: string;
    runId: string;
    promise: Promise<void>;
    cancel: () => void;
    result?: string;
}
/**
 * Run a single session to completion.
 *
 * The session acquires a concurrency seat (respecting maxConcurrentAgents),
 * runs the adapter's process, and persists task state on completion.
 */
export declare function runSession(config: SessionConfig): Promise<SessionHandle>;
/**
 * Run multiple sessions concurrently, each on its own model.
 *
 * Sessions are started in parallel up to maxConcurrentAgents; excess sessions
 * wait for a seat. Each session is independent: its own job state, health
 * tracker, and concurrency seat.
 */
export declare function runSessions(configs: SessionConfig[]): Promise<SessionHandle[]>;
