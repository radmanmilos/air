// Unit tests for the local-worker provisioning and doctor helpers.
//
// The heavy paths (creating a venv, pip install, talking to Ollama) are
// exercised by `tests/worker-provision.integration.test.ts`, which is opt-in.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MINIMUM_PYTHON,
  buildInstallArgs,
  buildVenvArgs,
  doctorLocalWorker,
  findWorkerPackage,
  formatDoctorReport,
  formatProvisionResult,
  meetsMinimumPython,
  parsePythonVersion,
  systemPythonCandidates,
  venvPython,
  workerCommand,
  workerLayout,
} from '../src/worker/provision';

const tmpDirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'air-worker-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.AIR_PYTHON;
  delete process.env.AIR_WORKER_PYTHON;
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('worker package discovery', () => {
  it('finds the bundled package from the source tree', () => {
    const dir = findWorkerPackage();
    expect(dir.endsWith(join('packages', 'local-worker'))).toBe(true);
    expect(existsSync(join(dir, 'pyproject.toml'))).toBe(true);
    expect(existsSync(join(dir, 'air_local', 'run.py'))).toBe(true);
  });

  it('throws a clear error when the package is missing', () => {
    const dir = tmp();
    expect(() => findWorkerPackage(dir)).toThrow(/packages\/local-worker not found/);
  });
});

describe('worker layout', () => {
  it('keeps the venv under the AIR cache directory', () => {
    const cacheDir = tmp();
    const layout = workerLayout({ cacheDir, packageDir: findWorkerPackage(), platform: 'linux' });
    expect(layout.rootDir).toBe(join(cacheDir, 'worker'));
    expect(layout.venvDir).toBe(join(cacheDir, 'worker', 'venv'));
    expect(layout.pythonPath).toBe(join(cacheDir, 'worker', 'venv', 'bin', 'python'));
    expect(layout.markerFile).toBe(join(cacheDir, 'worker', 'install.json'));
  });

  it('uses Scripts/python.exe on Windows', () => {
    expect(venvPython('C:\\cache\\venv', 'win32')).toBe(
      join('C:\\cache\\venv', 'Scripts', 'python.exe'),
    );
    expect(venvPython('/cache/venv', 'linux')).toBe(join('/cache/venv', 'bin', 'python'));
    expect(venvPython('/cache/venv', 'darwin')).toBe(join('/cache/venv', 'bin', 'python'));
  });
});

describe('python selection', () => {
  it('honours AIR_PYTHON', () => {
    process.env.AIR_PYTHON = '/custom/python';
    expect(systemPythonCandidates('linux')).toEqual(['/custom/python']);
  });

  it('prefers python on Windows and python3 elsewhere', () => {
    expect(systemPythonCandidates('win32')).toEqual(['python', 'py']);
    expect(systemPythonCandidates('linux')).toEqual(['python3', 'python']);
  });

  it('parses version strings', () => {
    expect(parsePythonVersion('3.14.6')).toEqual([3, 14, 6]);
    expect(parsePythonVersion('Python 3.12')).toEqual([3, 12, 0]);
    expect(parsePythonVersion('nonsense')).toBeNull();
  });

  it('enforces the minimum Python version', () => {
    expect(MINIMUM_PYTHON).toEqual([3, 12]);
    expect(meetsMinimumPython([3, 11, 9])).toBe(false);
    expect(meetsMinimumPython([3, 12, 0])).toBe(true);
    expect(meetsMinimumPython([3, 14, 2])).toBe(true);
    expect(meetsMinimumPython([4, 0, 0])).toBe(true);
    expect(meetsMinimumPython(null)).toBe(false);
  });
});

describe('command construction', () => {
  it('creates a venv with -m venv', () => {
    expect(buildVenvArgs('/tmp/venv')).toEqual(['-m', 'venv', '/tmp/venv']);
  });

  it('installs the bundled package without prompting', () => {
    const args = buildInstallArgs('/repo/packages/local-worker');
    expect(args.slice(0, 3)).toEqual(['-m', 'pip', 'install']);
    expect(args).toContain('--no-input');
    expect(args).toContain('--editable');
    expect(args[args.length - 1]).toBe('/repo/packages/local-worker');
  });
});

describe('worker command', () => {
  it('is null when the worker is not provisioned', () => {
    const cacheDir = tmp();
    const layout = workerLayout({ cacheDir, packageDir: findWorkerPackage(), platform: 'linux' });
    expect(workerCommand(layout)).toBeNull();
  });

  it('uses the venv interpreter when it exists', () => {
    const cacheDir = tmp();
    const layout = workerLayout({ cacheDir, packageDir: findWorkerPackage(), platform: 'linux' });
    mkdirSync(join(layout.venvDir, 'bin'), { recursive: true });
    writeFileSync(layout.pythonPath, '');
    expect(workerCommand(layout)).toEqual({
      executable: layout.pythonPath,
      args: ['-m', 'air_local.run'],
    });
  });

  it('honours AIR_WORKER_PYTHON as an override', () => {
    const cacheDir = tmp();
    const layout = workerLayout({ cacheDir, packageDir: findWorkerPackage(), platform: 'linux' });
    process.env.AIR_WORKER_PYTHON = '/custom/python';
    expect(workerCommand(layout)?.executable).toBe('/custom/python');
  });
});

describe('formatting', () => {
  it('renders a successful provision result', () => {
    const text = formatProvisionResult({
      ok: true,
      layout: workerLayout({ cacheDir: tmp(), packageDir: findWorkerPackage() }),
      created: true,
      steps: [
        { name: 'package', ok: true, detail: 'found' },
        { name: 'venv', ok: true, detail: 'created' },
        { name: 'install', ok: true, detail: 'air-local 0.2.0' },
      ],
    });
    expect(text).toContain('air setup local');
    expect(text).toContain('[ok] venv: created');
    expect(text).toContain('Local worker is ready.');
  });

  it('renders a failed provision result', () => {
    const text = formatProvisionResult({
      ok: false,
      layout: workerLayout({ cacheDir: tmp(), packageDir: findWorkerPackage() }),
      created: false,
      steps: [{ name: 'venv', ok: false, detail: 'no python' }],
      error: 'no Python 3.12+ interpreter found',
    });
    expect(text).toContain('[fail] venv: no python');
    expect(text).toContain('Setup failed: no Python 3.12+ interpreter found');
  });

  it('marks ok, fail, and skip checks distinctly', () => {
    const text = formatDoctorReport({
      ok: false,
      checks: [
        { id: 'python', label: 'Python', ok: true, detail: '3.14.6' },
        { id: 'venv', label: 'Worker venv', ok: false, detail: 'missing', hint: 'Run `air setup local`.' },
        { id: 'ollama', label: 'Ollama', ok: true, skipped: true, detail: 'skipped (--offline)' },
      ],
    });
    expect(text).toContain('[ok] Python: 3.14.6');
    expect(text).toContain('[fail] Worker venv: missing');
    expect(text).toContain('Run `air setup local`.');
    expect(text).toContain('[skip] Ollama: skipped (--offline)');
    expect(text).toContain('Some checks failed.');
  });
});

describe('doctor', () => {
  it('reports every check and never provisions', async () => {
    const cacheDir = tmp();
    const report = await doctorLocalWorker({ offline: true, cacheDir });
    expect(report.checks.map((c) => c.id)).toEqual(['python', 'venv', 'worker', 'ollama', 'models']);
    const venv = report.checks.find((c) => c.id === 'venv');
    expect(venv?.ok).toBe(false);
    expect(venv?.hint).toContain('air setup local');
    expect(report.checks.find((c) => c.id === 'ollama')?.skipped).toBe(true);
    expect(report.checks.find((c) => c.id === 'models')?.skipped).toBe(true);
    expect(report.ok).toBe(false);
    // Nothing was created on disk.
    expect(existsSync(join(cacheDir, 'worker'))).toBe(false);
  });

  it('is offline-friendly: the python check still runs', async () => {
    const report = await doctorLocalWorker({ offline: true, cacheDir: tmp() });
    const python = report.checks.find((c) => c.id === 'python');
    expect(python?.detail.length).toBeGreaterThan(0);
  });
});
