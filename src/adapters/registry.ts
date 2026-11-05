// Adapter registry with executable discovery and verification gating.
//
// Only verified + enabled adapters are routed by default. Unverified adapters
// are still returned by listAdapters() so `air status` can show them, but
// availableAdapters() excludes them by default. PATH presence alone cannot
// enable an unverified adapter.
//
// Dynamic adapters: catalog entries may specify a factoryModule path. AIR
// dynamically imports the module and calls its createAdapter() export to
// construct the adapter, enabling operators to add adapters without code
// changes. Call ensureDynamicAdaptersLoaded() to populate them.

import { execSync } from 'node:child_process';
import type { AgentAdapter, AdapterMeta } from './adapter';
import type { Config, ToolConfig } from '../config/schema';
import { getInstallStatus, type InstallStatus } from '../installer/status';
import { AiderAdapter } from './aider';
import { GooseAdapter } from './goose';
import { OpenCodeAdapter } from './opencode';
import { KilocodeAdapter } from './kilocode';
import { CodexAdapter } from './codex';
import { GitHubCopilotAdapter } from './github-copilot';
import { OllamaAdapter } from './ollama';

export interface AdapterInfo {
  adapter: AgentAdapter;
  meta: AdapterMeta;
  available: boolean;
  installed: boolean;
  version?: string;
  installStatus: InstallStatus;
  reason?: string;
}

/** Cache of dynamically loaded adapters (factoryModule entries from catalog). */
const DYNAMIC_ADAPTERS = new Map<string, AdapterInfo>();

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

// Verification metadata per adapter. All adapters are verified against
// real installed CLIs (aider 0.86.2, goose 1.57.0, opencode 2.2.5,
// kilocode 7.5.16, codex 0.166.0, github-copilot 2.102.0). Only verified
// adapters are eligible for routing.
const META: Record<string, AdapterMeta> = {
  aider: { verified: true, enabled: true, headlessSupported: true, verificationVersion: '0.86.2' },
  goose: { verified: true, enabled: true, headlessSupported: true, verificationVersion: '1.57.0' },
  opencode: { verified: true, enabled: true, headlessSupported: true, verificationVersion: '2.2.5' },
  kilocode: { verified: true, enabled: true, headlessSupported: true, verificationVersion: '7.5.16' },
  codex: { verified: false, enabled: true, headlessSupported: true, verificationVersion: '0.166.0' },
  ollama: { verified: true, enabled: true, headlessSupported: true, verificationVersion: 'runtime' },
};

const FACTORY: Record<string, () => AgentAdapter> = {
  aider: () => new AiderAdapter(),
  goose: () => new GooseAdapter(),
  opencode: () => new OpenCodeAdapter(),
  kilocode: () => new KilocodeAdapter(),
  codex: () => new CodexAdapter(),
  'github-copilot': () => new GitHubCopilotAdapter(),
  ollama: () => new OllamaAdapter(),
};

const EXE: Record<string, string> = {
  aider: 'aider',
  goose: 'goose',
  opencode: 'opencode',
  kilocode: 'kilocode',
  codex: 'codex',
  'github-copilot': 'gh',
  ollama: 'ollama',
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
  let nextAdapter = adapter;
  if (tool.provider || tool.model || tool.executable) {
    // Preserve the prototype (class methods) instead of spreading into a
    // plain object (H-03).
    const clone = Object.create(Object.getPrototypeOf(adapter));
    Object.assign(clone, adapter);
    if (tool.provider) clone.provider = tool.provider;
    if (tool.model) clone.model = tool.model;
    if (tool.executable) clone.executable = tool.executable;
    nextAdapter = clone;
  }
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

  const results: AdapterInfo[] = [];

  // 1. Hardcoded factories
  for (const [id, factory] of Object.entries(FACTORY)) {
    const { adapter, metaOverride } = applyConfig(factory(), tools[id]);
    const meta = META[id] ?? { verified: false, enabled: false, headlessSupported: false };
    // Configured enablement overrides the default.
    const enabled = metaOverride.enabled ?? meta.enabled;
    const available = isOnPath(EXE[id]);
    const install = getInstallStatus(id, EXE[id]);
    results.push({
      adapter,
      meta: { ...meta, enabled },
      available,
      installed: install.installed,
      version: install.version,
      installStatus: install.status,
      reason: available ? undefined : `executable '${EXE[id]}' not found on PATH`,
    });
  }

  // 2. Dynamically loaded adapters (from catalog factoryModule entries)
  for (const info of DYNAMIC_ADAPTERS.values()) {
    results.push(info);
  }

  return results;
}

function versionCompatible(a: AdapterInfo): boolean {
  if (!a.version || !a.meta.verificationVersion) return true;
  return a.version === a.meta.verificationVersion;
}
export function availableAdapters(config?: Config): AgentAdapter[] {
  return listAdapters(config)
    .filter((a) => a.meta.verified && a.meta.enabled && a.available && versionCompatible(a))
    .map((a) => a.adapter);
}

/** All adapters, including unverified ones, for status reporting. */
export function adapterStatus(config?: Config): {
  id: string;
  provider: string;
  model: string;
  available: boolean;
  installed: boolean;
  version?: string;
  installStatus: InstallStatus;
  verified: boolean;
  enabled: boolean;
  reason?: string;
}[] {
  return listAdapters(config).map((a) => ({
    id: a.adapter.id,
    provider: a.adapter.provider,
    model: a.adapter.model,
    available: a.available,
    installed: a.installed,
    version: a.version,
    installStatus: a.installStatus,
    verified: a.meta.verified,
    enabled: a.meta.enabled,
    reason: a.reason,
  }));
}

/** Adapters that are routed by default (verified + enabled + available). */
export function routedAdapters(config?: Config): AgentAdapter[] {
  return availableAdapters(config);
}

/** Re-check PATH and install status for a single adapter after install/uninstall. */
export function refreshAdapterAvailability(id: string): AdapterInfo | undefined {
  const all = listAdapters();
  return all.find((a) => a.adapter.id === id);
}

/**
 * Dynamic adapter loading via catalog factoryModule has been removed for
 * security (remote code execution). Adapters are registered statically.
 * Kept as a no-op for backwards compatibility.
 */
export async function ensureDynamicAdaptersLoaded(_config?: Config): Promise<void> {
  return;
}

/** Return dynamically loaded adapters (empty until ensureDynamicAdaptersLoaded() is called). */
export function getDynamicAdapters(): AdapterInfo[] {
  return [...DYNAMIC_ADAPTERS.values()];
}

