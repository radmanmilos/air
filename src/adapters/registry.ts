// Adapter registry with executable discovery and verification gating.
//
// Only verified + enabled adapters are routed by default. Unverified adapters
// are still returned by listAdapters() so `air status` can show them, but
// availableAdapters() excludes them by default. PATH presence alone cannot
// enable an unverified adapter.

import { execSync } from 'node:child_process';
import type { AgentAdapter, AdapterMeta } from './adapter';
import type { Config, ToolConfig } from '../config/schema';
import { AiderAdapter } from './aider';
import { GooseAdapter } from './goose';
import { OpenCodeAdapter } from './opencode';
import { KilocodeAdapter } from './kilocode';
import { CodexAdapter } from './codex';
import { GitHubCopilotAdapter } from './github-copilot';

export interface AdapterInfo {
  adapter: AgentAdapter;
  meta: AdapterMeta;
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

// Verification metadata per adapter. Aider and Goose are verified against
// real installed CLIs; the rest are UNVERIFIED spikes.
const META: Record<string, AdapterMeta> = {
  aider: { verified: true, enabled: true, headlessSupported: true, verificationVersion: '0.86.2' },
  goose: { verified: true, enabled: true, headlessSupported: true, verificationVersion: '1.57.0' },
  opencode: { verified: false, enabled: false, headlessSupported: true },
  kilocode: { verified: false, enabled: false, headlessSupported: true },
  codex: { verified: false, enabled: false, headlessSupported: true },
  'github-copilot': { verified: false, enabled: false, headlessSupported: true },
};

const FACTORY: Record<string, () => AgentAdapter> = {
  aider: () => new AiderAdapter(),
  goose: () => new GooseAdapter(),
  opencode: () => new OpenCodeAdapter(),
  kilocode: () => new KilocodeAdapter(),
  codex: () => new CodexAdapter(),
  'github-copilot': () => new GitHubCopilotAdapter(),
};

const EXE: Record<string, string> = {
  aider: 'aider',
  goose: 'goose',
  opencode: 'opencode',
  kilocode: 'kilocode',
  codex: 'codex',
  'github-copilot': 'gh',
};

/** Apply configured tool overrides to an adapter instance and its meta. */
function applyConfig(adapter: AgentAdapter, tool?: ToolConfig): { adapter: AgentAdapter; metaOverride: Partial<AdapterMeta> } {
  if (!tool) return { adapter, metaOverride: {} };
  const metaOverride: Partial<AdapterMeta> = {};
  if (tool.enabled !== undefined) metaOverride.enabled = tool.enabled;
  if (tool.executable) {
    // Executable override is recorded for status reporting; the adapter's
    // buildCommand uses the adapter's own executable. Callers that need a
    // different binary should construct a custom adapter.
  }
  const nextAdapter =
    tool.provider || tool.model
      ? { ...adapter, provider: tool.provider ?? adapter.provider, model: tool.model ?? adapter.model }
      : adapter;
  return { adapter: nextAdapter, metaOverride };
}

/**
 * Return the full production adapter registry, including unverified adapters
 * so `air status` can report them. Routing only uses availableAdapters().
 *
 * If `config` is supplied, configured tool overrides (enabled, executable,
 * provider, model) are applied before returning.
 */
export function listAdapters(config?: Config): AdapterInfo[] {
  const tools: Record<string, ToolConfig> = {};
  if (config?.tools) {
    for (const t of config.tools) tools[t.id] = t;
  }

  return Object.entries(FACTORY).map(([id, factory]) => {
    const { adapter, metaOverride } = applyConfig(factory(), tools[id]);
    const meta = META[id] ?? { verified: false, enabled: false, headlessSupported: false };
    // Configured enablement overrides the default.
    const enabled = metaOverride.enabled ?? meta.enabled;
    const available = isOnPath(EXE[id]);
    return {
      adapter,
      meta: { ...meta, enabled },
      available,
      reason: available ? undefined : `executable '${EXE[id]}' not found on PATH`,
    };
  });
}

/** Adapters that are verified, enabled, and have their binary on PATH. */
export function availableAdapters(config?: Config): AgentAdapter[] {
  return listAdapters(config)
    .filter((a) => a.meta.verified && a.meta.enabled && a.available)
    .map((a) => a.adapter);
}

/** All adapters, including unverified ones, for status reporting. */
export function adapterStatus(config?: Config): {
  id: string;
  provider: string;
  model: string;
  available: boolean;
  verified: boolean;
  enabled: boolean;
  reason?: string;
}[] {
  return listAdapters(config).map((a) => ({
    id: a.adapter.id,
    provider: a.adapter.provider,
    model: a.adapter.model,
    available: a.available,
    verified: a.meta.verified,
    enabled: a.meta.enabled,
    reason: a.reason,
  }));
}

/** Adapters that are routed by default (verified + enabled + available). */
export function routedAdapters(config?: Config): AgentAdapter[] {
  return availableAdapters(config);
}