// Config loader with precedence: CLI > env > repo .airrc.yaml > global > defaults.
// Repo config is untrusted by default: strict schema, unknown keys rejected,
// verify.command never executed from repo config.

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { paths } from './paths';
import { safeParseConfig, formatConfigError, type Config } from './schema';
import { redact } from '../security/redact';

export interface LoadOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  cliOverrides?: Partial<Config>;
  strict?: boolean; // reject unknown repo keys (default true)
}

export async function loadConfig(options: LoadOptions = {}): Promise<{ config: Config; errors: string[] }> {
  const env = options.env ?? process.env;
  const errors: string[] = [];

  // 1. Defaults
  let config: Config = {
    version: 1,
    tools: [],
    failover: { mode: 'ask', maxHops: 3, cooldownMinutes: 60, allowProviderSwitch: false },
    verify: { enabled: false },
    redaction: { enabled: true },
    concurrency: { maxConcurrentAgents: 1 },
    timeouts: { defaultMs: 300_000, perTool: {} },
    buffers: { maxBytes: 1_000_000 },
    logging: { level: 'info', redact: true },
  };

  // 2. Global config
  try {
    const raw = await readFile(paths.globalConfigFile, 'utf8');
    const parsed = safeParseConfig(parseYamlLike(raw), { strict: false });
    if (parsed.success) config = merge(config, parsed.data);
    else errors.push(formatConfigError(parsed.error, paths.globalConfigFile));
  } catch {
    // missing global config is fine
  }

  // 3. Repo config (untrusted)
  const repoFile = options.cwd ? `${options.cwd}/.airrc.yaml` : '.airrc.yaml';
  try {
    const raw = await readFile(repoFile, 'utf8');
    const parsed = safeParseConfig(parseYamlLike(raw), { strict: options.strict !== false });
    if (parsed.success) config = merge(config, parsed.data);
    else errors.push(formatConfigError(parsed.error, repoFile));
  } catch {
    // missing repo config is fine
  }

  // 4. Env overrides
  if (env.AIR_FAILOVER_MODE === 'auto' || env.AIR_FAILOVER_MODE === 'ask') {
    config.failover = { ...config.failover, mode: env.AIR_FAILOVER_MODE };
  }
  if (env.AIR_MAX_CONCURRENT_AGENTS) {
    const n = parseInt(env.AIR_MAX_CONCURRENT_AGENTS, 10);
    if (!Number.isNaN(n) && n > 0) config.concurrency = { ...config.concurrency, maxConcurrentAgents: n };
  }

  // 5. CLI overrides (highest)
  if (options.cliOverrides) config = merge(config, options.cliOverrides);

  return { config, errors: errors.map((e) => redact(e)) };
}

function merge(base: Config, override: Partial<Config>): Config {
  return {
    ...base,
    ...override,
    failover: { ...base.failover, ...(override.failover || {}) },
    verify: { ...base.verify, ...(override.verify || {}) },
    redaction: { ...base.redaction, ...(override.redaction || {}) },
    concurrency: { ...base.concurrency, ...(override.concurrency || {}) },
    timeouts: { ...base.timeouts, ...(override.timeouts || {}) },
    buffers: { ...base.buffers, ...(override.buffers || {}) },
    logging: { ...base.logging, ...(override.logging || {}) },
    tools: override.tools ?? base.tools,
  };
}

/** Minimal YAML parser: handles the flat/structured subset air uses.
 *  Uses the `yaml` package when available; falls back to JSON. */
function parseYamlLike(raw: string): unknown {
  return parse(raw);
}

export async function validateConfigFile(file: string): Promise<string[]> {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = safeParseConfig(parseYamlLike(raw), { strict: true });
    if (parsed.success) return [];
    return [formatConfigError(parsed.error, file)];
  } catch (err) {
    return [`Could not read ${file}: ${(err as Error).message}`];
  }
}

export async function migrateConfig(): Promise<{ ok: boolean; message: string }> {
  // MVP: current schema is version 1; nothing to migrate yet.
  return { ok: true, message: 'Config is already at the current schema version (1).' };
}