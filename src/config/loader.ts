// Config loader with precedence: CLI > env > repo .airrc.yaml > global > defaults.
// Repo config is untrusted by default: strict schema, unknown keys rejected,
// verify.command never executed from repo config.

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { paths } from './paths';
import { CONFIG_VERSION, DEFAULT_CONFIG, safeParseConfig, formatConfigError, type Config } from './schema';
import { redact } from '../security/redact';

// Keys that may only be set in the global (user) config, never in a repo
// `.airrc.yaml`. Repo values for these are ignored (with a warning).
const GLOBAL_ONLY_KEYS = [
  'failover', 'permission', 'redaction', 'trustedRepos', 'tools',
  'concurrency', 'verify', 'catalog', 'costOverrides', 'timeouts',
  'buffers', 'logging', 'models',
];

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
  let config: Config = structuredClone(DEFAULT_CONFIG);

  // 2. Global config
  try {
    const raw = await readFile(paths.globalConfigFile, 'utf8');
    const parsed = safeParseConfig(parseYamlLike(raw), { strict: false });
    if (parsed.success) config = merge(config, parsed.data);
    else errors.push(formatConfigError(parsed.error, paths.globalConfigFile));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      errors.push(`Could not read/parse ${paths.globalConfigFile}: ${String(err?.message || err)}`);
    }
  }

  // 3. Repo config (untrusted)
  const repoFile = options.cwd ? `${options.cwd}/.airrc.yaml` : '.airrc.yaml';
  try {
    const raw = await readFile(repoFile, 'utf8');
    const parsed = safeParseConfig(parseYamlLike(raw), { strict: options.strict !== false });
    if (parsed.success) {
      // Strip global-only keys from repo config (security: repo cannot set them).
      const repoData = { ...parsed.data } as Record<string, unknown>;
      // The version identifies the repo file schema; it is not an effective
      // runtime setting and must not override the global config version.
      delete repoData.version;
      const stripped: string[] = [];
      for (const key of GLOBAL_ONLY_KEYS) {
        if (key in repoData) {
          delete repoData[key];
          stripped.push(key);
        }
      }
      if (stripped.length > 0) {
        errors.push(`Warning: repo config ${repoFile} cannot set global-only keys (${stripped.join(', ')}); ignored.`);
      }
      config = merge(config, repoData as Partial<Config>);
    } else {
      errors.push(formatConfigError(parsed.error, repoFile));
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      errors.push(`Could not read/parse ${repoFile}: ${String(err?.message || err)}`);
    }
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
    catalog: { ...base.catalog, ...(override.catalog || {}) },
    timeouts: { ...base.timeouts, ...(override.timeouts || {}) },
    buffers: { ...base.buffers, ...(override.buffers || {}) },
    logging: { ...base.logging, ...(override.logging || {}) },
    models: override.models ? {
      ...base.models,
      ...override.models,
      providers: { ...base.models.providers, ...override.models.providers },
      roles: { ...base.models.roles, ...override.models.roles },
    } : base.models,
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

export async function migrateConfig(
  options: { file?: string } = {},
): Promise<{ ok: boolean; message: string }> {
  const file = options.file ?? paths.globalConfigFile;
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true, message: 'No global config exists; AIR will use version ' + CONFIG_VERSION + ' defaults.' };
    }
    return { ok: false, message: redact('Could not read config: ' + (error as Error).message) };
  }

  const document = parseDocument(raw);
  if (document.errors.length > 0) {
    return { ok: false, message: 'Configuration YAML is invalid; fix it before migration.' };
  }

  const value = document.toJS() ?? {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'Configuration root must be a YAML mapping.' };
  }
  const record = value as Record<string, unknown>;
  const currentVersion = typeof record.version === 'number' ? record.version : 1;
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    return { ok: false, message: 'Configuration version must be a positive integer.' };
  }
  if (currentVersion > CONFIG_VERSION) {
    return {
      ok: false,
      message: 'Config version ' + currentVersion + ' is newer than this AIR version supports (' + CONFIG_VERSION + ').',
    };
  }
  if (currentVersion === CONFIG_VERSION) {
    return { ok: true, message: 'Config is already at the current schema version (' + CONFIG_VERSION + ').' };
  }

  const validation = safeParseConfig(record, { strict: false });
  if (!validation.success) {
    return { ok: false, message: redact(formatConfigError(validation.error, file)) };
  }

  // Version 1 -> 2 adds global-only model/provider roles. Preserve all existing
  // user keys and comments; only add the new defaults and update the version.
  if (!document.has('models')) document.set('models', DEFAULT_CONFIG.models);
  document.set('version', CONFIG_VERSION);

  const temporaryFile = file + '.tmp-' + process.pid + '-' + randomUUID();
  try {
    const originalStats = await stat(file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporaryFile, document.toString(), { encoding: 'utf8', mode: originalStats.mode & 0o777 });
    await rename(temporaryFile, file);
    return { ok: true, message: 'Migrated global config from version 1 to version ' + CONFIG_VERSION + '.' };
  } catch (error) {
    await rm(temporaryFile, { force: true }).catch(() => undefined);
    return { ok: false, message: redact('Could not write migrated config: ' + (error as Error).message) };
  }
}