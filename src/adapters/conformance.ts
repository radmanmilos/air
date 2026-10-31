// Shared classifyError helper used by conformance tests.
// Adapters must classify using structured fields first, then exit code +
// stderr evidence, then adapter-specific patterns. Never scan stdout prose.
//
// This helper validates an adapter's output is sane and consistent with the
// evidence it was given. A failing adapter (e.g. one that returns RATE_LIMIT
// for an auth error) is rejected.

import type { AgentAdapter } from './adapter';
import type { ErrorCategory } from '../types/errors';
import { getErrorAction } from '../types/errors';

const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed/i;
const RATE_LIMIT_RE = /rate limit|429|too many requests/i;
const TIMEOUT_RE = /timeout|timed out/i;
const NOT_FOUND_RE = /not found|not installed|enoent/i;

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
export function classifyError(
  adapter: AgentAdapter,
  exitCode: number | null,
  stderr: string,
  structured?: unknown,
): ErrorCategory {
  const category = adapter.classifyError(exitCode, stderr, structured);

  if (!getErrorAction(category)) {
    throw new Error(`Adapter ${adapter.id} returned unknown category: ${category}`);
  }

  // When process facts (timedOut, cancelled, spawnError) drive the
  // classification, the stderr evidence is irrelevant — skip consistency
  // checks so a timeout with "rate limit" in stderr doesn't trip the
  // evidence guard.
  const s = structured as { timedOut?: boolean; cancelled?: boolean; spawnError?: unknown } | undefined;
  if (s?.timedOut || s?.cancelled || s?.spawnError) {
    return category;
  }

  // Evidence consistency checks.
  if (AUTH_RE.test(stderr) && category !== 'AUTH_ERROR' && category !== 'UNKNOWN') {
    throw new Error(
      `Adapter ${adapter.id} returned ${category} but stderr contains an auth error`,
    );
  }
  if (RATE_LIMIT_RE.test(stderr) && category !== 'RATE_LIMIT' && category !== 'UNKNOWN') {
    throw new Error(
      `Adapter ${adapter.id} returned ${category} but stderr contains a rate limit error`,
    );
  }
  if (TIMEOUT_RE.test(stderr) && category !== 'TIMEOUT' && category !== 'UNKNOWN') {
    throw new Error(
      `Adapter ${adapter.id} returned ${category} but stderr contains a timeout`,
    );
  }
  if (NOT_FOUND_RE.test(stderr) && category !== 'TOOL_NOT_INSTALLED' && category !== 'MODEL_UNAVAILABLE' && category !== 'UNKNOWN') {
    throw new Error(
      `Adapter ${adapter.id} returned ${category} but stderr indicates the tool or model is missing`,
    );
  }

  return category;
}

export { getErrorAction };