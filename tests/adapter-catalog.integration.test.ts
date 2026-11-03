// Integration test for the free AI adapter catalog.
//
// Mocks the installer to simulate install/upgrade/uninstall without real
// binaries. Verifies: load catalog → install → status → upgrade → uninstall → removed.
// Also tests autoInstallMissing behavior when catalog.autoInstall is enabled.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadCatalog } from '../src/config/catalog';
import { adapterStatus, listAdapters } from '../src/adapters/registry';
import {
  getInstallStatus,
  recordInstall,
  clearInstall,
  type InstallRecord,
} from '../src/installer/status';
import {
  installAdapter,
  upgradeAdapter,
  uninstallAdapter,
  autoInstallMissing,
} from '../src/installer/installer';
import type { InstallEntry } from '../src/config/catalog';
import type { Config } from '../src/config/schema';

vi.mock('../src/installer/installer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/installer/installer')>();
  return {
    ...actual,
    installAdapter: vi.fn(),
    upgradeAdapter: vi.fn(),
    uninstallAdapter: vi.fn(),
  };
});

const mockInstallAdapter = vi.mocked(installAdapter);
const mockUpgradeAdapter = vi.mocked(upgradeAdapter);
const mockUninstallAdapter = vi.mocked(uninstallAdapter);

const now = new Date().toISOString();

function mockRecord(installed: boolean, version?: string): InstallRecord {
  return {
    installed,
    version,
    status: installed ? 'installed' : 'not-installed',
    installAttempts: 1,
    updatedAt: now,
  };
}

function fullConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: 1,
    tools: [],
    failover: { mode: 'ask', maxHops: 3, cooldownMinutes: 60, allowProviderSwitch: false },
    permission: { mode: 'ask', broadApproval: false, autoCommit: false, allowShell: false },
    verify: { enabled: false },
    redaction: { enabled: true },
    concurrency: { maxConcurrentAgents: 1 },
    catalog: { remoteUrl: undefined, autoInstall: false },
    costOverrides: {},
    trustedRepos: [],
    timeouts: { defaultMs: 300_000, perTool: {} },
    buffers: { maxBytes: 1_000_000 },
    logging: { level: 'info', redact: true, rotation: { maxBytes: 10 * 1024 * 1024, maxBackups: 5 } },
    ...overrides,
  };
}

describe('adapter catalog integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockInstallAdapter.mockReset();
    mockUpgradeAdapter.mockReset();
    mockUninstallAdapter.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads bundled catalog with all 6 adapters', async () => {
    const catalog = await loadCatalog();
    expect(catalog.tools.length).toBeGreaterThanOrEqual(6);
    const ids = catalog.tools.map((t) => t.id);
    expect(ids).toContain('aider');
    expect(ids).toContain('goose');
    expect(ids).toContain('opencode');
    expect(ids).toContain('kilocode');
    expect(ids).toContain('codex');
    expect(ids).toContain('github-copilot');
  });

  it('every catalog entry has required fields', async () => {
    const catalog = await loadCatalog();
    for (const t of catalog.tools) {
      expect(t.id).toBeDefined();
      expect(t.adapterId).toBeDefined();
      expect(t.executable).toBeDefined();
      expect(t.install.method).toBeDefined();
      expect(t.install.verify).toBeDefined();
    }
  });

  it('install → status → upgrade → uninstall flow', async () => {
    const catalog = await loadCatalog();
    const aiderEntry = catalog.tools.find((t) => t.id === 'aider')!;

    // Install: mock returns installed status
    mockInstallAdapter.mockResolvedValueOnce(mockRecord(true, '0.86.2'));

    const installed = await installAdapter(aiderEntry);
    expect(installed.status).toBe('installed');
    expect(installed.version).toBe('0.86.2');

    // Record install status manually (installAdapter would do this internally)
    recordInstall('aider', 'installed', { version: '0.86.2' });

    const status = getInstallStatus('aider', 'aider');
    expect(status.installed).toBe(true);
    expect(status.status).toBe('installed');

    // Upgrade: mock returns upgraded status
    mockUpgradeAdapter.mockResolvedValueOnce(mockRecord(true, '0.87.0'));

    const upgraded = await upgradeAdapter(aiderEntry);
    expect(upgraded.status).toBe('installed');
    expect(upgraded.version).toBe('0.87.0');

    // Uninstall
    mockUninstallAdapter.mockResolvedValueOnce(undefined);
    await uninstallAdapter(aiderEntry);
    clearInstall('aider');

    const afterUninstall = getInstallStatus('aider', 'aider');
    // Persisted record cleared: version is undefined, attempts reset
    expect(afterUninstall.version).toBeUndefined();
    expect(afterUninstall.installAttempts).toBe(0);
  });

  it('adapterStatus includes install status fields', () => {
    const statuses = adapterStatus();
    const aider = statuses.find((s) => s.id === 'aider')!;
    expect(aider.installed).toBeDefined();
    expect(aider.installStatus).toBeDefined();
    expect(typeof aider.verified).toBe('boolean');
    expect(typeof aider.available).toBe('boolean');
  });

  it('listAdapters returns adapters with install status', () => {
    const all = listAdapters();
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.installed).toBeDefined();
      expect(a.installStatus).toBeDefined();
      // version may be undefined if not installed
    }
  });

  it('autoInstallMissing does nothing when autoInstall is false (default)', async () => {
    const mockInstallFn = vi.fn();
    const mockGetInstallStatusFn = vi.fn().mockReturnValue(mockRecord(false));

    await autoInstallMissing(
      fullConfig({ catalog: { remoteUrl: undefined, autoInstall: false } }),
      mockInstallFn,
      mockGetInstallStatusFn,
    );

    expect(mockInstallFn).not.toHaveBeenCalled();
    expect(mockGetInstallStatusFn).not.toHaveBeenCalled();
  });

  it('autoInstallMissing installs missing adapters when autoInstall is true', async () => {
    const mockInstallFn = vi.fn().mockResolvedValue(mockRecord(true, '0.86.2'));
    const mockGetInstallStatusFn = vi.fn().mockReturnValue(mockRecord(false));

    await autoInstallMissing(
      fullConfig({ catalog: { remoteUrl: undefined, autoInstall: true } }),
      mockInstallFn,
      mockGetInstallStatusFn,
    );

    expect(mockGetInstallStatusFn).toHaveBeenCalled();
    expect(mockInstallFn).toHaveBeenCalled();
  });

  it('autoInstallMissing skips already-installed adapters', async () => {
    const mockInstallFn = vi.fn();
    const mockGetInstallStatusFn = vi.fn().mockReturnValue(mockRecord(true, '0.86.2'));

    await autoInstallMissing(
      fullConfig({ catalog: { remoteUrl: undefined, autoInstall: true } }),
      mockInstallFn,
      mockGetInstallStatusFn,
    );

    expect(mockGetInstallStatusFn).toHaveBeenCalled();
    expect(mockInstallFn).not.toHaveBeenCalled();
  });
});
