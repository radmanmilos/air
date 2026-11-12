import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { loadConfig, validateConfigFile, migrateConfig } from '../src/config/loader';
import { CONFIG_VERSION } from '../src/config/schema';
import { describe, it, expect } from 'vitest';

describe('config loader (G2-03)', () => {
  const dir = join(tmpdir(), 'air-config-' + process.pid);

  it('returns local-first model defaults when no config exists', async () => {
    const { config, errors } = await loadConfig({ cwd: join(dir, 'defaults') });
    expect(config.version).toBe(CONFIG_VERSION);
    expect(config.failover.mode).toBe('ask');
    expect(config.models.localFirst).toBe(true);
    expect(config.models.maxConcurrentGenerative).toBe(1);
    expect(config.models.roles.coordinator).toEqual({ provider: 'ollama', model: 'qwen3.5:4b' });
    expect(errors).toEqual([]);
  });

  it('ignores model/provider role overrides from untrusted repo config', async () => {
    const repo = join(dir, 'repo-models');
    await mkdir(repo, { recursive: true });
    await writeFile(
      join(repo, '.airrc.yaml'),
      'version: 2\nmodels:\n  localFirst: false\n  roles:\n    coordinator:\n      provider: hosted\n      model: paid-model\n',
    );
    const { config, errors } = await loadConfig({ cwd: repo });
    expect(config.models.localFirst).toBe(true);
    expect(config.models.roles.coordinator).toEqual({ provider: 'ollama', model: 'qwen3.5:4b' });
    expect(errors.some((error) => error.includes('models') && error.includes('global-only'))).toBe(true);
  });

  it('ignores global-only keys from repo config (security)', async () => {
    const repo = join(dir, 'repo-global');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, '.airrc.yaml'), 'version: 1\nfailover:\n  mode: auto\n  maxHops: 2\n');
    const { config, errors } = await loadConfig({ cwd: repo });
    expect(config.failover.mode).toBe('ask');
    expect(config.failover.maxHops).toBe(3);
    expect(errors.some((error) => error.includes('global-only'))).toBe(true);
  });

  it('rejects unknown repo keys in strict mode', async () => {
    const repo = join(dir, 'strict');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, '.airrc.yaml'), 'version: 1\nbogusKey: true\n');
    const { errors } = await loadConfig({ cwd: repo });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('CLI overrides take precedence over repo config', async () => {
    const repo = join(dir, 'precedence');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, '.airrc.yaml'), 'version: 1\nfailover:\n  mode: auto\n');
    const { config } = await loadConfig({
      cwd: repo,
      cliOverrides: { failover: { mode: 'ask', maxHops: 3, cooldownMinutes: 60, allowProviderSwitch: false } },
    });
    expect(config.failover.mode).toBe('ask');
  });

  it('allows changing one model role without restating every role', async () => {
    const repo = join(dir, 'partial-models');
    await mkdir(repo, { recursive: true });
    const configFile = join(repo, 'config.yaml');
    await writeFile(configFile, 'version: 2\nmodels:\n  roles:\n    coder:\n      provider: ollama\n      model: qwen2.5-coder:7b\n');
    const errors = await validateConfigFile(configFile);
    expect(errors).toEqual([]);
  });

  it('validateConfigFile reports no errors for valid v1 config', async () => {
    const file = join(dir, 'valid-v1.yaml');
    await writeFile(file, 'version: 1\n');
    const errors = await validateConfigFile(file);
    expect(errors).toEqual([]);
  });

  it('migrates v1 config atomically, preserving settings and comments', async () => {
    const fileDir = join(dir, 'migration');
    await mkdir(fileDir, { recursive: true });
    const file = join(fileDir, 'config.yaml');
    await writeFile(file, '# Keep this operator note\nversion: 1\nfailover:\n  mode: auto\n  maxHops: 2\n');
    const result = await migrateConfig({ file });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('version 1 to version 2');
    const raw = await readFile(file, 'utf8');
    const migrated = parse(raw) as Record<string, unknown>;
    expect(raw).toContain('# Keep this operator note');
    expect(migrated.version).toBe(2);
    expect(migrated.failover).toEqual({ mode: 'auto', maxHops: 2 });
    expect((migrated.models as { localFirst: boolean }).localFirst).toBe(true);

    const second = await migrateConfig({ file });
    expect(second.ok).toBe(true);
    expect(second.message).toContain('already at the current schema version');
  });

  it('does not rewrite invalid config during migration', async () => {
    const fileDir = join(dir, 'invalid-migration');
    await mkdir(fileDir, { recursive: true });
    const file = join(fileDir, 'config.yaml');
    const original = 'version: 1\npermission:\n  mode: unsafe\n';
    await writeFile(file, original);
    const result = await migrateConfig({ file });
    expect(result.ok).toBe(false);
    expect(await readFile(file, 'utf8')).toBe(original);
  });

  it('does not downgrade a config written by a newer AIR version', async () => {
    const fileDir = join(dir, 'future-migration');
    await mkdir(fileDir, { recursive: true });
    const file = join(fileDir, 'config.yaml');
    await writeFile(file, 'version: 3\n');
    const result = await migrateConfig({ file });
    expect(result.ok).toBe(false);
    expect(await readFile(file, 'utf8')).toBe('version: 3\n');
  });

  it('reports when no global config file exists', async () => {
    const file = join(dir, 'missing', 'config.yaml');
    const result = await migrateConfig({ file });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('No global config exists');
  });

  it('redacts a token value present in repo config errors', async () => {
    const repo = join(dir, 'secret-token');
    await mkdir(repo, { recursive: true });
    const token = 'sk-or-this-is-a-fake-test-key-1234567890abcdef';
    await writeFile(join(repo, '.airrc.yaml'), 'version: 1\n' + token + ': true\n');
    const { errors } = await loadConfig({ cwd: repo });
    for (const error of errors) {
      expect(error).not.toContain(token);
    }
  });
});
