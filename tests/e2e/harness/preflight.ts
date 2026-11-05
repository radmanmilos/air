// tests/e2e/harness/preflight.ts
export interface PreflightResult { ok: boolean; skipReason?: string; details: Record<string, any>; }

export function preflight(): PreflightResult {
  const details: Record<string, any> = {};
  try {
    const { execFileSync } = require('node:child_process');
    details.dotnet = execFileSync('dotnet', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    details.dotnet = null;
  }
  try {
    const { execFileSync } = require('node:child_process');
    details.node = process.version;
  } catch { /* noop */ }
  const ok = true;
  return { ok, details };
}

export function hasDotnet(): boolean {
  try {
    const { execFileSync } = require('node:child_process');
    execFileSync('dotnet', ['--list-sdks'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch { return false; }
}