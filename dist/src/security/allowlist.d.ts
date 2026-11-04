import type { AgentAdapter } from '../adapters/adapter';
import type { TaskInput } from '../types';
export interface AllowList {
    providers: string[];
    models: string[];
}
/** Build the task's provider-destination policy from the actual first
 *  selected candidate (R5-04). Never use adapters[0] directly: the first
 *  adapter in the list may be cooling down or blocked, in which case the
 *  policy must describe the candidate actually chosen for the task. */
export declare function defaultAllowList(adapters: AgentAdapter[], chosen?: {
    provider: string;
    model: string;
} | null): AllowList;
export declare function isProviderAllowed(provider: string, allow: AllowList): boolean;
export declare function isModelAllowed(model: string, allow: AllowList): boolean;
export declare function checkHandoffAllowlist(from: AgentAdapter, to: AgentAdapter, allow: AllowList): {
    ok: boolean;
    reason?: string;
};
export declare function buildHandoff(task: TaskInput, from: AgentAdapter, to: AgentAdapter): string;
