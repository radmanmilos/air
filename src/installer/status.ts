// Install status tracking with atomic persistence.
//
// Persisted install status lives in cacheDir/installs.json:
//   map of adapterId -> { installed, version, installedAt, updatedAt,
//     status, error, installAttempts }
//
// Atomic write (temp + rename). Live PATH check combined with persisted
// status to determine installed/outdated/not-installed/failed.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { paths } from '../config/paths';

export type InstallStatus = 'installed' | 'outdated' | 'failed' | 'not-installed';

export interface InstallRecord {
  installed: boolean;
  version?: string;
  installedAt?: string;
  updatedAt: string;
  status: InstallStatus;
  error?: string;
  installAttempts: number;
}

const INSTALLS_FILE = join(paths.cacheDir, 'installs.json');

function isBinaryOnPath(exe: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${exe}` : `command -v ${exe}`, {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function readInstalls(): Map<string, InstallRecord> {
  try {
    if (!existsSync(INSTALLS_FILE)) return new Map();
    const raw = JSON.parse(readFileSync(INSTALLS_FILE, 'utf8'));
    const map = new Map<string, InstallRecord>();
    for (const [id, rec] of Object.entries(raw)) {
      map.set(id, rec as InstallRecord);
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeInstalls(map: Map<string, InstallRecord>): void {
  mkdirSync(paths.cacheDir, { recursive: true });
  const tmp = INSTALLS_FILE + '.tmp';
  const obj: Record<string, InstallRecord> = {};
  for (const [id, rec] of map) obj[id] = rec;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, INSTALLS_FILE);
}

/** Record install status for an adapter (atomic). */
export function recordInstall(
  adapterId: string,
  status: InstallStatus,
  options: { version?: string; error?: string; installed?: boolean } = {},
): void {
  const map = readInstalls();
  const now = new Date().toISOString();
  const prev = map.get(adapterId);
  const record: InstallRecord = {
    installed: options.installed ?? status === 'installed',
    version: options.version ?? prev?.version,
    installedAt: prev?.installedAt ?? (status === 'installed' ? now : undefined),
    updatedAt: now,
    status,
    error: options.error,
    installAttempts: (prev?.installAttempts ?? 0) + 1,
  };
  map.set(adapterId, record);
  writeInstalls(map);
}

/** Get install status for an adapter, combining live PATH check + persisted. */
export function getInstallStatus(adapterId: string, executable: string): InstallRecord {
  const map = readInstalls();
  const persisted = map.get(adapterId);
  const liveInstalled = isBinaryOnPath(executable);

  let status: InstallStatus;
  if (!liveInstalled) {
    status = 'not-installed';
  } else if (persisted?.status === 'failed') {
    status = 'failed';
  } else if (persisted?.status === 'installed') {
    status = 'installed';
  } else {
    status = 'installed';
  }

  return {
    installed: liveInstalled,
    version: persisted?.version,
    installedAt: persisted?.installedAt,
    updatedAt: persisted?.updatedAt ?? new Date().toISOString(),
    status,
    error: persisted?.error,
    installAttempts: persisted?.installAttempts ?? 0,
  };
}

/** Check if an adapter binary is currently on PATH. */
export function isInstalled(executable: string): boolean {
  return isBinaryOnPath(executable);
}

/** Clear the install record for an adapter (e.g. on uninstall). */
export function clearInstall(adapterId: string): void {
  const map = readInstalls();
  map.delete(adapterId);
  writeInstalls(map);
}
