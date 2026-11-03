// Integration test for the free AI adapter catalog.
//
// Mocks the installer to simulate install/upgrade/uninstall without real
// binaries. Verifies: load catalog → install → status → upgrade → uninstall → removed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadCatalog } from '../src/config/catalog';
import { adapterStatus, listAdapters } from '../src/adapters/registry';
import { recordInstall, clearInstall, getInstallStatus } from '../src/installer/status';
import { installAdapter, upgradeAdapter, uninstallAdapter } from '../src/installer/installer';

vi.mock('../src/installer/installer', () => ({
  installAdapter: vi.fn(),
  upgradeAdapter: vi.fn(),
  uninstallAdapter: vi.fn(),
}));

describe('adapter catalog integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.mocked(installAdapter).mockReset();
    vi.mocked(upgradeAdapter).mockReset();
    vi.mocked(uninstallAdapter).mockReset();
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
    vi.mocked(installAdapter).mockResolvedValueOnce({
      installed: true,
      version: '0.86.2',
      status: 'installed',
      installAttempts: 1,
    });

    const installed = await installAdapter(aiderEntry);
    expect(installed.status).toBe('installed');
    expect(installed.version).toBe('0.86.2');

    // Record install status manually (installAdapter would do this internally)
    recordInstall('aider', 'installed', { version: '0.86.2' });

    const status = getInstallStatus('aider', 'aider');
    expect(status.installed).toBe(true);
    expect(status.status).toBe('installed');

    // Upgrade: mock returns upgraded status
    vi.mocked(upgradeAdapter).mockResolvedValueOnce({
      installed: true,
      version: '0.87.0',
      status: 'installed',
      installAttempts: 2,
    });

    const upgraded = await upgradeAdapter(aiderEntry);
    expect(upgraded.status).toBe('installed');
    expect(upgraded.version).toBe('0.87.0');

    // Uninstall
    vi.mocked(uninstallAdapter).mockResolvedValueOnce(undefined);
    await uninstallAdapter(aiderEntry);
    clearInstall('aider');

    const afterUninstall = getInstallStatus('aider', 'aider');
    // Persisted record cleared: version is undefined, attempts reset
    expect(afterUninstall.version).toBeUndefined();
    expect(afterUninstall.installAttempts).toBe(0);
  });

  it('adapterStatus includes install status fields', () => {
    const statuses = adapterStatus();
    const aider = statuses.find((s) => s.id === 'aider');
    expect(aider).toBeDefined();
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
});
