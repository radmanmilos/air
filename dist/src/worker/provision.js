// Provisioning and health checks for the internal local worker.
//
// The worker (`packages/local-worker`) is not a user-facing tool: `air` owns it.
// `air setup local` creates a private virtualenv under the AIR cache directory
// and installs the bundled package into it. `air doctor` reports whether the
// pieces a local job needs are present: Python, the venv, the worker package,
// the Ollama server, and at least one model.
//
// Everything here is deliberately boring and observable: no prompts, no hidden
// state, no network access except the explicit Ollama checks.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { paths } from '../config/paths.js';
const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Minimum Python the worker supports (see packages/local-worker/pyproject.toml). */
export const MINIMUM_PYTHON = [3, 12];
/**
 * Walk up from this module until `packages/local-worker/pyproject.toml` is
 * found. Works from source, from `dist/`, and from the npm package layout.
 */
export function findWorkerPackage(startDir = __dirname) {
    let dir = resolve(startDir);
    for (;;) {
        const candidate = join(dir, 'packages', 'local-worker');
        if (existsSync(join(candidate, 'pyproject.toml')))
            return candidate;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    throw new Error('packages/local-worker not found; this build is missing the bundled worker');
}
export function venvPython(venvDir, platform = process.platform) {
    return platform === 'win32'
        ? join(venvDir, 'Scripts', 'python.exe')
        : join(venvDir, 'bin', 'python');
}
export function workerLayout(options = {}) {
    const rootDir = join(options.cacheDir ?? paths.cacheDir, 'worker');
    const venvDir = join(rootDir, 'venv');
    return {
        packageDir: options.packageDir ?? findWorkerPackage(),
        rootDir,
        venvDir,
        pythonPath: venvPython(venvDir, options.platform),
        markerFile: join(rootDir, 'install.json'),
    };
}
export function systemPythonCandidates(platform = process.platform) {
    const fromEnv = process.env.AIR_PYTHON;
    if (fromEnv)
        return [fromEnv];
    return platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
}
export function buildVenvArgs(venvDir) {
    return ['-m', 'venv', venvDir];
}
export function buildInstallArgs(packageDir) {
    // Editable: `air_local` must resolve to the bundled source so the worker can
    // find the canonical `contracts/job.schema.json` and `config.yaml` by walking
    // up from the package. A copied install would break both.
    return [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-input',
        '--editable',
        packageDir,
    ];
}
/** Parse `3.14.6` / `Python 3.14.6` into numeric parts. */
export function parsePythonVersion(output) {
    const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
    if (!match)
        return null;
    return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}
export function meetsMinimumPython(version, minimum = MINIMUM_PYTHON) {
    if (!version)
        return false;
    if (version[0] !== minimum[0])
        return version[0] > minimum[0];
    return version[1] >= minimum[1];
}
async function run(executable, args, options = {}) {
    try {
        const { stdout, stderr } = await execFileAsync(executable, args, {
            timeout: options.timeoutMs ?? 120_000,
            env: options.env ?? process.env,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
        });
        return { code: 0, stdout: String(stdout), stderr: String(stderr) };
    }
    catch (err) {
        const e = err;
        return {
            code: typeof e.code === 'number' ? e.code : 1,
            stdout: String(e.stdout ?? ''),
            stderr: String(e.stderr ?? e.message ?? ''),
        };
    }
}
async function findSystemPython(platform = process.platform) {
    for (const executable of systemPythonCandidates(platform)) {
        const info = await pythonInfo(executable);
        if (info)
            return info;
    }
    return null;
}
async function pythonInfo(executable) {
    const result = await run(executable, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], { timeoutMs: 15_000 });
    if (result.code !== 0)
        return null;
    const version = parsePythonVersion(result.stdout);
    if (!version)
        return null;
    return { executable, version, raw: result.stdout.trim() };
}
function packageVersion(packageDir) {
    const init = join(packageDir, 'air_local', '__init__.py');
    const match = /__version__\s*=\s*"([^"]+)"/.exec(readFileSync(init, 'utf8'));
    return match ? match[1] : '0.0.0';
}
function readMarker(markerFile) {
    try {
        return JSON.parse(readFileSync(markerFile, 'utf8'));
    }
    catch {
        return null;
    }
}
/**
 * Create the venv (unless it exists) and install the bundled worker package
 * into it. Idempotent: a matching install marker is reused unless `force`.
 */
export async function provisionLocalWorker(options = {}) {
    const layout = workerLayout(options);
    const log = options.log ?? (() => { });
    const steps = [];
    const fail = (error) => ({ ok: false, layout, created: false, steps, error });
    if (!existsSync(join(layout.packageDir, 'pyproject.toml'))) {
        steps.push({ name: 'package', ok: false, detail: `missing ${layout.packageDir}` });
        return fail(`bundled worker package not found at ${layout.packageDir}`);
    }
    steps.push({ name: 'package', ok: true, detail: layout.packageDir });
    const version = packageVersion(layout.packageDir);
    const marker = readMarker(layout.markerFile);
    const hasVenv = existsSync(layout.pythonPath);
    const installed = marker?.packageVersion === version;
    let created = false;
    if (hasVenv && !options.force) {
        steps.push({ name: 'venv', ok: true, detail: `reused ${layout.venvDir}` });
        log(`reusing venv at ${layout.venvDir}`);
    }
    else {
        if (hasVenv) {
            log('removing existing venv (--force)');
            rmSync(layout.venvDir, { recursive: true, force: true });
        }
        const system = options.python
            ? await pythonInfo(options.python)
            : await findSystemPython();
        if (!system) {
            steps.push({ name: 'venv', ok: false, detail: 'no Python interpreter found' });
            return fail(`no Python ${MINIMUM_PYTHON.join('.')}+ interpreter found; install Python or set AIR_PYTHON`);
        }
        if (!meetsMinimumPython(system.version)) {
            steps.push({
                name: 'venv',
                ok: false,
                detail: `${system.executable} is too old (${system.version?.join('.') ?? 'unknown'})`,
            });
            return fail(`Python ${MINIMUM_PYTHON.join('.')}+ is required`);
        }
        log(`creating venv at ${layout.venvDir} with ${system.executable}`);
        mkdirSync(layout.rootDir, { recursive: true });
        const createdVenv = await run(system.executable, buildVenvArgs(layout.venvDir), {
            timeoutMs: 300_000,
        });
        if (createdVenv.code !== 0 || !existsSync(layout.pythonPath)) {
            steps.push({
                name: 'venv',
                ok: false,
                detail: (createdVenv.stderr || createdVenv.stdout).trim().slice(0, 500),
            });
            return fail('failed to create the worker virtualenv');
        }
        created = true;
        steps.push({ name: 'venv', ok: true, detail: `created ${layout.venvDir}` });
    }
    if (installed && !options.force) {
        steps.push({ name: 'install', ok: true, detail: `air-local ${version} already installed` });
        return { ok: true, layout, created, steps };
    }
    log(`installing air-local ${version} from ${layout.packageDir}`);
    const install = await run(layout.pythonPath, buildInstallArgs(layout.packageDir), {
        timeoutMs: 600_000,
    });
    if (install.code !== 0) {
        steps.push({
            name: 'install',
            ok: false,
            detail: (install.stderr || install.stdout).trim().slice(0, 1000),
        });
        return fail('failed to install the worker package');
    }
    steps.push({ name: 'install', ok: true, detail: `air-local ${version}` });
    writeFileSync(layout.markerFile, JSON.stringify({ packageVersion: version, installedAt: new Date().toISOString() }, null, 2));
    return { ok: true, layout, created, steps };
}
/** The command AIR uses to run one job. `null` when the worker is not provisioned. */
export function workerCommand(layout = workerLayout()) {
    const override = process.env.AIR_WORKER_PYTHON;
    if (override)
        return { executable: override, args: ['-m', 'air_local.run'] };
    if (existsSync(layout.pythonPath)) {
        return { executable: layout.pythonPath, args: ['-m', 'air_local.run'] };
    }
    return null;
}
export function formatProvisionResult(result) {
    const lines = ['air setup local'];
    for (const step of result.steps) {
        lines.push(`  [${step.ok ? 'ok' : 'fail'}] ${step.name}: ${step.detail}`);
    }
    lines.push(result.ok ? 'Local worker is ready.' : `Setup failed: ${result.error ?? 'unknown error'}`);
    return lines.join('\n');
}
export function formatDoctorReport(report) {
    const lines = ['air doctor'];
    for (const check of report.checks) {
        const mark = check.skipped ? 'skip' : check.ok ? 'ok' : 'fail';
        lines.push(`  [${mark}] ${check.label}: ${check.detail}`);
        if (!check.ok && !check.skipped && check.hint)
            lines.push(`         ${check.hint}`);
    }
    lines.push(report.ok ? 'All checks passed.' : 'Some checks failed.');
    return lines.join('\n');
}
async function fetchJson(url, timeoutMs) {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { accept: 'application/json' },
        });
        let body = null;
        try {
            body = await response.json();
        }
        catch {
            body = null;
        }
        return { ok: response.ok, status: response.status, body };
    }
    catch {
        return { ok: false, status: 0, body: null };
    }
}
/** Report whether a local job can run. Read-only: it never provisions. */
export async function doctorLocalWorker(options = {}) {
    const layout = workerLayout(options);
    const checks = [];
    const system = await findSystemPython();
    checks.push({
        id: 'python',
        label: 'Python',
        ok: !!system && meetsMinimumPython(system.version),
        detail: system
            ? `${system.executable} (${system.version.join('.')})`
            : `not found (need ${MINIMUM_PYTHON.join('.')}+)`,
        hint: `Install Python ${MINIMUM_PYTHON.join('.')}+ or set AIR_PYTHON.`,
    });
    const hasVenv = existsSync(layout.pythonPath);
    checks.push({
        id: 'venv',
        label: 'Worker venv',
        ok: hasVenv,
        detail: hasVenv ? layout.venvDir : `missing (${layout.venvDir})`,
        hint: 'Run `air setup local`.',
    });
    if (hasVenv) {
        const imported = await run(layout.pythonPath, ['-c', 'import air_local, air_local.run'], {
            timeoutMs: 30_000,
        });
        checks.push({
            id: 'worker',
            label: 'Worker package',
            ok: imported.code === 0,
            detail: imported.code === 0
                ? 'air_local imports'
                : (imported.stderr || imported.stdout).trim().slice(0, 300) || 'import failed',
            hint: 'Run `air setup local --force`.',
        });
    }
    else {
        checks.push({
            id: 'worker',
            label: 'Worker package',
            ok: false,
            skipped: true,
            detail: 'skipped (no venv)',
            hint: 'Run `air setup local`.',
        });
    }
    if (options.offline) {
        checks.push({
            id: 'ollama',
            label: 'Ollama',
            ok: true,
            skipped: true,
            detail: 'skipped (--offline)',
        });
        checks.push({
            id: 'models',
            label: 'Models',
            ok: true,
            skipped: true,
            detail: 'skipped (--offline)',
        });
    }
    else {
        const base = (options.ollamaUrl ?? process.env.AIR_OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
        const version = await fetchJson(`${base}/api/version`, 2000);
        checks.push({
            id: 'ollama',
            label: 'Ollama',
            ok: version.ok,
            detail: version.ok
                ? `${base} (${String(version.body?.version ?? 'unknown')})`
                : `${base} unreachable`,
            hint: 'Start Ollama (`ollama serve`) or set AIR_OLLAMA_URL.',
        });
        const tags = version.ok ? await fetchJson(`${base}/api/tags`, 3000) : { ok: false, status: 0, body: null };
        const models = Array.isArray(tags.body?.models)
            ? (tags.body.models)
            : [];
        checks.push({
            id: 'models',
            label: 'Models',
            ok: tags.ok && models.length > 0,
            detail: tags.ok
                ? models.length > 0
                    ? `${models.length} model(s) available`
                    : 'no models installed'
                : 'cannot list models (Ollama unreachable)',
            hint: 'Run `ollama pull qwen2.5-coder:7b` (or your preferred model).',
        });
    }
    return { ok: checks.every((c) => c.ok || c.skipped), checks };
}
