// Opt-in integration test for real worker provisioning.
//
// Creating a venv and installing the bundled package needs Python 3.12+ and
// network access for dependencies, so it does not run by default. Enable it
// with AIR_PROVISION_TEST=1 (CI does this in the Python-aware job).
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  doctorLocalWorker,
  findWorkerPackage,
  provisionLocalWorker,
  workerCommand,
  workerLayout,
} from '../src/worker/provision';

const enabled = process.env.AIR_PROVISION_TEST === '1';
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!enabled)('real worker provisioning', () => {
  it('creates a venv, installs the worker, and reuses it', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'air-provision-it-'));
    dirs.push(cacheDir);
    const packageDir = findWorkerPackage();

    const first = await provisionLocalWorker({ cacheDir, packageDir });
    expect(first.ok, first.error).toBe(true);
    expect(first.created).toBe(true);
    expect(existsSync(first.layout.pythonPath)).toBe(true);
    expect(existsSync(first.layout.markerFile)).toBe(true);

    const command = workerCommand(first.layout);
    expect(command).not.toBeNull();
    const version = execFileSync(command!.executable, [...command!.args, '--help'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    expect(version).toContain('--request');

    // Editable install: the worker must find the canonical contract by walking
    // up from the bundled source, not from site-packages.
    const contractPath = execFileSync(
      first.layout.pythonPath,
      ['-c', 'from air_local import contract; print(contract.schema_path())'],
      { encoding: 'utf8' },
    ).trim();
    expect(contractPath.endsWith(join('contracts', 'job.schema.json'))).toBe(true);
    expect(existsSync(contractPath)).toBe(true);

    const second = await provisionLocalWorker({ cacheDir, packageDir });
    expect(second.ok).toBe(true);
    expect(second.created).toBe(false);
    expect(second.steps.find((s) => s.name === 'install')?.detail).toContain('already installed');

    const report = await doctorLocalWorker({ offline: true, cacheDir });
    const layout = workerLayout({ cacheDir, packageDir });
    expect(layout.pythonPath).toBe(first.layout.pythonPath);
    expect(report.checks.find((c) => c.id === 'venv')?.ok).toBe(true);
    expect(report.checks.find((c) => c.id === 'worker')?.ok).toBe(true);
  }, 300_000);
});
