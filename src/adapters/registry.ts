// Adapter registry with executable discovery.
//
// Only real configured adapters are registered by default. The mock adapter
// is test-only and is injected explicitly by tests; it is never reachable
// from production code.

import { execSync } from 'node:child_process';
import type { AgentAdapter } from './adapter';
import { AiderAdapter } from './aider';
import { GooseAdapter } from './goose';
import { OpenCodeAdapter } from './opencode';
import { KilocodeAdapter } from './kilocode';
import { CodexAdapter } from './codex';
import { GitHubCopilotAdapter } from './github-copilot';

export interface AdapterInfo {
  adapter: AgentAdapter;
  available: boolean;
  reason?: string;
}

function isOnPath(exe: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${exe}` : `command -v ${exe}`, {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the production adapter registry.
 *
 * Aider and Goose are registered when their executables are discoverable
 * on PATH. Adapters whose binary is missing are still returned with
 * `available: false` so the router can record a precise skip reason
 * (`TOOL_NOT_INSTALLED`) instead of silently omitting them.
 */
export function listAdapters(): AdapterInfo[] {
  const candidates: { adapter: AgentAdapter; exe: string }[] = [
    { adapter: new AiderAdapter(), exe: 'aider' },
    { adapter: new GooseAdapter(), exe: 'goose' },
    { adapter: new OpenCodeAdapter(), exe: 'opencode' },
    { adapter: new KilocodeAdapter(), exe: 'kilocode' },
    { adapter: new CodexAdapter(), exe: 'codex' },
    { adapter: new GitHubCopilotAdapter(), exe: 'gh' },
  ];

  return candidates.map(({ adapter, exe }) => {
    const available = isOnPath(exe);
    return {
      adapter,
      available,
      reason: available ? undefined : `executable '${exe}' not found on PATH`,
    };
  });
}

/** Filter to available adapters only. */
export function availableAdapters(): AgentAdapter[] {
  return listAdapters().filter((a) => a.available).map((a) => a.adapter);
}

/** Map of adapter id -> AdapterInfo for status reporting. */
export function adapterStatus(): { id: string; provider: string; model: string; available: boolean; reason?: string }[] {
  return listAdapters().map((a) => ({
    id: a.adapter.id,
    provider: a.adapter.provider,
    model: a.adapter.model,
    available: a.available,
    reason: a.reason,
  }));
}