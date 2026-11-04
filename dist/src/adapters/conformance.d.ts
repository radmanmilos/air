import type { AgentAdapter } from './adapter';
import type { ErrorCategory } from '../types/errors';
import { getErrorAction } from '../types/errors';
/**
 * Validate that an adapter's classifyError output is sane and consistent
 * with the evidence it was given.
 *
 * Throws if the adapter returns an unknown category, or if the category
 * contradicts obvious evidence (e.g. RATE_LIMIT for stderr containing an
 * auth error).
 *
 * Process facts (timedOut, cancelled, spawnError) take precedence over
 * stderr matching and are passed as `structured`.
 */
export declare function classifyError(adapter: AgentAdapter, exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory;
export { getErrorAction };
