// Config loader with precedence: CLI > env > repo .airrc.yaml > global > defaults.
// Repo config is untrusted by default: strict schema, unknown keys rejected,
// verify.command never executed from repo config.
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { paths } from './paths.js';
import { CONFIG_VERSION, DEFAULT_CONFIG, safeParseConfig, formatConfigError } from './schema.js';
import { redact } from '../security/redact.js';
// Keys that may only be set in the global (user) config, never in a repo
// `.airrc.yaml`. Repo values for these are ignored (with a warning).
const GLOBAL_ONLY_KEYS = [
    'failover', 'permission', 'redaction', 'trustedRepos', 'tools',
    'concurrency', 'verify', 'catalog', 'costOverrides', 'timeouts',
    'buffers', 'logging', 'models',
];
export async function loadConfig(options = {}) {
    const env = options.env ?? process.env;
    const errors = [];
    // 1. Defaults
    let config = structuredClone(DEFAULT_CONFIG);
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
    const repoFile = options.cwd ? options.cwd + '/.airrc.yaml' : '.airrc.yaml';
    try {
        const raw = await readFile(repoFile, 'utf8');
        const parsedInput = parseYamlLike(raw);
        const repoData = isRecord(parsedInput) ? { ...parsedInput } : parsedInput;
        const stripped = [];
        // Remove user-owned settings before validation. Invalid values in a
        // repository-controlled model/provider section must not prevent safe
        // project-level settings from loading or trigger provider configuration.
        if (isRecord(repoData)) {
            for (const key of GLOBAL_ONLY_KEYS) {
                if (key in repoData) {
                    delete repoData[key];
                    stripped.push(key);
                }
            }
        }
        const parsed = safeParseConfig(repoData, { strict: options.strict !== false });
        if (parsed.success) {
            const effectiveRepoData = { ...parsed.data };
            // The version is schema metadata, not an effective runtime setting.
            delete effectiveRepoData.version;
            // Schema defaults are materialized by parsing; strip them too so
            // omitted global-only fields cannot overwrite the user's global config.
            for (const key of GLOBAL_ONLY_KEYS)
                delete effectiveRepoData[key];
            config = merge(config, effectiveRepoData);
            if (stripped.length > 0) {
                errors.push('Warning: repo config ' + repoFile + ' cannot set global-only keys (' + stripped.join(', ') + '); ignored.');
            }
        }
        else {
            errors.push(formatConfigError(parsed.error, repoFile));
        }
    }
    catch (err) {
        if (err?.code !== 'ENOENT') {
            errors.push('Could not read/parse ' + repoFile + ': ' + String(err?.message || err));
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
function parseYamlLike(raw) {
    return parse(raw);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
export async function migrateConfig(options = {}) {
    const file = options.file ?? paths.globalConfigFile;
    let raw;
    try {
        raw = await readFile(file, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return { ok: true, message: 'No global config exists; AIR will use version ' + CONFIG_VERSION + ' defaults.' };
        }
        return { ok: false, message: redact('Could not read config: ' + error.message) };
    }
    const document = parseDocument(raw);
    if (document.errors.length > 0) {
        return { ok: false, message: 'Configuration YAML is invalid; fix it before migration.' };
    }
    const value = document.toJS() ?? {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, message: 'Configuration root must be a YAML mapping.' };
    }
    const record = value;
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
    if (!document.has('models'))
        document.set('models', DEFAULT_CONFIG.models);
    document.set('version', CONFIG_VERSION);
    const temporaryFile = file + '.tmp-' + process.pid + '-' + randomUUID();
    try {
        const originalStats = await stat(file);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(temporaryFile, document.toString(), { encoding: 'utf8', mode: originalStats.mode & 0o777 });
        await rename(temporaryFile, file);
        return { ok: true, message: 'Migrated global config from version 1 to version ' + CONFIG_VERSION + '.' };
    }
    catch (error) {
        await rm(temporaryFile, { force: true }).catch(() => undefined);
        return { ok: false, message: redact('Could not write migrated config: ' + error.message) };
    }
}
