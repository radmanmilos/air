import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Orchestrator } from '../orchestrator/orchestrator';
interface Job {
    state: any;
    controller: AbortController;
    promise: Promise<void>;
    orch?: Orchestrator;
    runId: string;
    cwd: string;
}
export declare const jobs: Map<string, Job>;
export declare function runAttempt(job: any, adapter: any, taskInput: any): Promise<void>;
export declare function resolveNextCandidate(job: any): Promise<{
    adapter: any;
    taskInput: any;
} | null>;
export declare function startMcp(transport?: Transport): Promise<{
    server: McpServer;
    transport: Transport;
}>;
export {};
