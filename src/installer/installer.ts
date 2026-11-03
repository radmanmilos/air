// Installer: install/upgrade/uninstall adapters via package-manager or
// direct-download. Output is redacted before logging.
//
// All operations record results in installs.json (see installer/status.ts).

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { runProcess } from '../execution/runner';
import { redact } from '../security/redact';
import { recordInstall, clearInstall, getInstallStatus, type InstallRecord } from './status';
import type { InstallEntry } from '../config/catalog';
import type { Config } from '../config/schema';
import { paths } from '../config/paths';

export interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux' | 'other';
  arch: 'x64' | 'arm64' | 'ia32' | 'other';
}

function detectPlatform(): PlatformInfo {
  const platform = process.platform as PlatformInfo['platform'];
  const arch = (() => {
    switch (process.arch) {
      case 'x64': return 'x64';
      case 'arm64': return 'arm64';
      case 'ia32': return 'ia32';
      default: return 'other';
    }
  })();
  return { platform, arch };
}

async function runCommand(cmd: string): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const parts = cmd.split(/\s+/).filter(Boolean);
    const exe = parts[0];
    const args = parts.slice(1);
    const { outcome } = await runProcess({ executable: exe, args, cwd: process.cwd() }, {
      timeoutMs: 120_000,
      maxBufferBytes: 1_000_000,
      stdoutTailBytes: 2048,
      stderrTailBytes: 2048,
      onStdout: () => {},
      onStderr: () => {},
    });
    const output = redact(outcome.stdoutTail ?? outcome.stdout);
    if (outcome.exitCode === 0 && !outcome.spawnError && !outcome.timedOut && !outcome.cancelled) {
      return { ok: true, output };
    }
    return { ok: false, output, error: redact(outcome.stderr.slice(0, 500)) };
  } catch (err: any) {
    return { ok: false, output: '', error: String(err?.message || err) };
  }
}

function parseVersion(output: string): string | undefined {
  const match = output.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : undefined;
}

/** Install an adapter via package-manager or direct-download. */
export async function installAdapter(entry: InstallEntry): Promise<InstallRecord> {
  const { platform, arch } = detectPlatform();
  const method = entry.install.method;

  if (method === 'package-manager') {
    const cmd = entry.install.commands?.[platform];
    if (!cmd) {
      const err = `No package-manager command for platform ${platform}`;
      process.stderr.write(`air: install ${entry.id}: ${err}\n`);
      recordInstall(entry.id, 'failed', { error: err });
      return getInstallStatus(entry.id, entry.executable);
    }

    process.stderr.write(`air: installing ${entry.id} via ${cmd}\n`);
    const result = await runCommand(cmd);

    if (!result.ok) {
      recordInstall(entry.id, 'failed', { error: result.error });
      return getInstallStatus(entry.id, entry.executable);
    }

    const verify = await runCommand(entry.install.verify);
    const version = verify.ok ? parseVersion(verify.output) : undefined;
    if (!verify.ok || !version) {
      const err = verify.error ?? 'verify command failed or produced no version';
      process.stderr.write(`air: install ${entry.id}: ${err}\n`);
      recordInstall(entry.id, 'failed', { error: err });
      return getInstallStatus(entry.id, entry.executable);
    }

    recordInstall(entry.id, 'installed', { version });
    process.stderr.write(`air: installed ${entry.id} v${version}\n`);
    return getInstallStatus(entry.id, entry.executable);
  }

  // direct-download
  const urlMap = entry.install.urls;
  if (!urlMap) {
    const err = `No download URLs for ${entry.id}`;
    process.stderr.write(`air: install ${entry.id}: ${err}\n`);
    recordInstall(entry.id, 'failed', { error: err });
    return getInstallStatus(entry.id, entry.executable);
  }

  const platformUrls = urlMap[platform];
  if (!platformUrls) {
    const err = `No download URL for platform ${platform}`;
    process.stderr.write(`air: install ${entry.id}: ${err}\n`);
    recordInstall(entry.id, 'failed', { error: err });
    return getInstallStatus(entry.id, entry.executable);
  }

  const url = platformUrls[arch] ?? platformUrls.other;
  if (!url) {
    const err = `No download URL for ${platform}/${arch}`;
    process.stderr.write(`air: install ${entry.id}: ${err}\n`);
    recordInstall(entry.id, 'failed', { error: err });
    return getInstallStatus(entry.id, entry.executable);
  }

  const downloadUrl = typeof url === 'string' ? { url } : url;

  try {
    process.stderr.write(`air: downloading ${entry.id} from ${downloadUrl.url}\n`);
    const res = await fetch(downloadUrl.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const binDir = join(paths.cacheDir, 'bin');
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, entry.executable);
    writeFileSync(binPath, Buffer.from(bytes));

    // Signature verification: if a signatureUrl is provided, download it and
    // compare the SHA-256 hash of the binary against the expected hash.
    if (downloadUrl.signatureUrl) {
      try {
        const sigRes = await fetch(downloadUrl.signatureUrl, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!sigRes.ok) throw new Error(`HTTP ${sigRes.status}`);
        const expectedHash = (await sigRes.text()).trim();
        const actualHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
        if (actualHash !== expectedHash) {
          throw new Error(
            `signature mismatch: expected ${expectedHash}, got ${actualHash}`,
          );
        }
      } catch (err: any) {
        // Remove the downloaded binary on signature failure.
        try { rmSync(binPath, { force: true }); } catch { /* noop */ }
        const error = `signature verification failed: ${String(err?.message || err)}`;
        process.stderr.write(`air: install ${entry.id}: ${error}\n`);
        recordInstall(entry.id, 'failed', { error });
        return getInstallStatus(entry.id, entry.executable);
      }
    }

    if (platform !== 'win32') {
      try { chmodSync(binPath, 0o755); } catch { /* best-effort */ }
    }

    const verify = await runCommand(`${binPath} ${entry.install.verify}`);
    const version = verify.ok ? parseVersion(verify.output) : undefined;
    if (!verify.ok || !version) {
      const err = verify.error ?? 'verify command failed or produced no version';
      process.stderr.write(`air: install ${entry.id}: ${err}\n`);
      recordInstall(entry.id, 'failed', { error: err });
      return getInstallStatus(entry.id, entry.executable);
    }

    recordInstall(entry.id, 'installed', { version });
    process.stderr.write(`air: installed ${entry.id} v${version}\n`);
    return getInstallStatus(entry.id, entry.executable);
  } catch (err: any) {
    const error = String(err?.message || err);
    process.stderr.write(`air: install ${entry.id}: ${error}\n`);
    recordInstall(entry.id, 'failed', { error });
    return getInstallStatus(entry.id, entry.executable);
  }
}

/** Upgrade an adapter to the catalog version if outdated. */
export async function upgradeAdapter(entry: InstallEntry): Promise<InstallRecord> {
  const current = getInstallStatus(entry.id, entry.executable);
  if (current.status === 'installed' && current.version === entry.install.version) {
    process.stderr.write(`air: ${entry.id} already at v${current.version}\n`);
    return current;
  }
  return installAdapter(entry);
}

/** Uninstall an adapter. */
export async function uninstallAdapter(entry: InstallEntry): Promise<void> {
  const binDir = join(paths.cacheDir, 'bin');
  const binPath = join(binDir, entry.executable);

  try {
    if (existsSync(binPath)) {
      rmSync(binPath, { force: true });
    }
  } catch { /* best-effort */ }

  if (entry.install.method === 'package-manager') {
    process.stderr.write(`air: ${entry.id} installed via package-manager; clearing status only\n`);
  }

  clearInstall(entry.id);
  process.stderr.write(`air: uninstalled ${entry.id}\n`);
}

/**
 * Auto-install missing adapters when catalog.autoInstall is enabled.
 *
 * Fire-and-forget: installs are kicked off in the background so the current
 * task is not blocked. Newly installed adapters become available for
 * subsequent tasks. Failures are recorded in installs.json and logged to
 * stderr only (never stdout, to protect the MCP protocol).
 *
 * @param installFn - optional override for testing (defaults to installAdapter)
 * @param getInstallStatusFn - optional override for testing (defaults to getInstallStatus)
 */
export async function autoInstallMissing(
  config: Config,
  installFn: typeof installAdapter = installAdapter,
  getInstallStatusFn: typeof getInstallStatus = getInstallStatus,
): Promise<void> {
  if (config.catalog?.autoInstall !== true) return;

  const { loadCatalog, catalogTools } = await import('../config/catalog');
  const catalog = await loadCatalog(config);
  const tools = catalogTools(catalog);

  for (const entry of tools) {
    const status = getInstallStatusFn(entry.id, entry.executable);
    if (status.installed && status.status === 'installed') continue;

    // Fire-and-forget: do not await, so the current task is not blocked.
    installFn(entry).catch((err: any) => {
      process.stderr.write(`air: auto-install ${entry.id} failed: ${String(err?.message || err)}\n`);
    });
  }
}
