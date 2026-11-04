// Config loader with precedence: CLI > env > repo .airrc.yaml > global > defaults.
// Repo config is untrusted by default: strict schema, unknown keys rejected,
// verify.command never executed from repo config.
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { paths } from './paths.js';
import { safeParseConfig, formatConfigError } from './schema.js';
import { redact } from '../security/redact.js';
// Keys that may only be set in the global (user) config, never in a repo
// `.airrc.yaml`. Repo values for these are ignored (with a warning).
const GLOBAL_ONLY_KEYS = [
    'failover', 'permission', 'redaction', 'trustedRepos', 'tools',
    'concurrency', 'verify', 'catalog', 'costOverrides', 'timeouts',
    'buffers', 'logging',
];
export async function loadConfig(options = {}) {
    const env = options.env ?? process.env;
    const errors = [];
    // 1. Defaults
    let config = {
        version: 1,
        tools: [],
        failover: { mode: 'ask', maxHops: 3, cooldownMinutes: 60, allowProviderSwitch: false },
        permission: { mode: 'ask', broadApproval: false, autoCommit: false, allowShell: false, allowNetwork: false, allowInstall: false },
        verify: { enabled: false },
        redaction: { enabled: true },
        concurrency: { maxConcurrentAgents: 1 },
        catalog: { remoteUrl: undefined, autoInstall: false },
        costOverrides: {},
        trustedRepos: [],
        timeouts: { defaultMs: 300_000, perTool: {} },
        buffers: { maxBytes: 1_000_000 },
        logging: { level: 'info', redact: true, rotation: { maxBytes: 10 * 1024 * 1024, maxBackups: 5 } },
    };
    // 2. Global config
    try {
        const raw = await readFile(paths.globalConfigFile, 'utf8');
        const parsed = safeParseConfig(parseYamlLike(raw), { strict: false });
        if (parsed.success)
            config = merge(config, parsed.data);
        else
            errors.push(formatConfigError(parsed.error, paths.globalConfigFile));
    }
    catch (err) {
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
            const repoData = { ...parsed.data };
            const stripped = [];
            for (const key of GLOBAL_ONLY_KEYS) {
                if (key in repoData) {
                    delete repoData[key];
                    stripped.push(key);
                }
            }
            if (stripped.length > 0) {
                errors.push(`Warning: repo config ${repoFile} cannot set global-only keys (${stripped.join(', ')}); ignored.`);
            }
            config = merge(config, repoData);
        }
        else {
            errors.push(formatConfigError(parsed.error, repoFile));
        }
    }
    catch (err) {
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
        if (!Number.isNaN(n) && n > 0)
            config.concurrency = { ...config.concurrency, maxConcurrentAgents: n };
    }
    // 5. CLI overrides (highest)
    if (options.cliOverrides)
        config = merge(config, options.cliOverrides);
    return { config, errors: errors.map((e) => redact(e)) };
}
function merge(base, override) {
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
        tools: override.tools ?? base.tools,
    };
}
/** Minimal YAML parser: handles the flat/structured subset air uses.
 *  Uses the `yaml` package when available; falls back to JSON. */
function parseYamlLike(raw) {
    return parse(raw);
}
export async function validateConfigFile(file) {
    try {
        const raw = await readFile(file, 'utf8');
        const parsed = safeParseConfig(parseYamlLike(raw), { strict: true });
        if (parsed.success)
            return [];
        return [formatConfigError(parsed.error, file)];
    }
    catch (err) {
        return [`Could not read ${file}: ${err.message}`];
    }
}
export async function migrateConfig() {
    // MVP: current schema is version 1; nothing to migrate yet.
    return { ok: true, message: 'Config is already at the current schema version (1).' };
}
