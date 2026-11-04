import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, validateConfigFile, migrateConfig } from '../src/config/loader';
import { CONFIG_VERSION } from '../src/config/schema';
import { describe, it, expect } from 'vitest';

describe('config loader (G2-03)', () => {
  const dir = join(tmpdir(), `air-config-${process.pid}`);

  it('returns defaults when no config exists', async () => {
    const { config, errors } = await loadConfig({ cwd: dir });
    expect(config.version).toBe(CONFIG_VERSION);
    expect(config.failover.mode).toBe('ask');
    expect(errors).toEqual([]);
  });

  it('ignores global-only keys from repo config (security)', async () => {
    const repo = join(dir, 'repo');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, '.airrc.yaml'), 'version: 1\nfailover:\n  mode: auto\n  maxHops: 2\n');
    const { config, errors } = await loadConfig({ cwd: repo });
    // Repo cannot set global-only keys: defaults remain.
    expect(config.failover.mode).toBe('ask');
    expect(config.failover.maxHops).toBe(3);
    expect(errors.some((e) => e.includes('global-only'))).toBe(true);
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

  it('validateConfigFile reports no errors for valid config', async () => {
    const file = join(dir, 'valid.yaml');
    await writeFile(file, 'version: 1\n');
    const errors = await validateConfigFile(file);
    expect(errors).toEqual([]);
  });

  it('migrateConfig reports current version', async () => {
    const result = await migrateConfig();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1');
  });

  it('redacts a token value present in repo config errors', async () => {
    const repo = join(dir, 'secret-token');
    await mkdir(repo, { recursive: true });
    const token = 'sk-or-this-is-a-fake-test-key-1234567890abcdef';
    await writeFile(join(repo, '.airrc.yaml'), `version: 1\n${token}: true\n`);
    const { errors } = await loadConfig({ cwd: repo });
    for (const e of errors) {
      expect(e).not.toContain(token);
    }
  });
});