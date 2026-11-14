// Unified-diff application confined to a single workspace directory.
//
// All paths in the patch must be relative and may not escape the workspace.
// Application is performed with `git apply` after path validation. The
// repository working tree is never touched.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, normalize, sep } from 'node:path';

export interface PatchApplyResult {
  ok: boolean;
  appliedFiles: string[];
  error?: string;
}

const DIFF_PATH_RE = /^(?:---|\+\+\+)\s+(?:a\/|b\/)?(.+)$/;

function isSafeRelativePath(p: string): boolean {
  if (!p || p === '/dev/null') return true;
  if (isAbsolute(p)) return false;
  const norm = normalize(p);
  if (norm.startsWith('..') || norm.includes('..' + sep)) return false;
  if (norm.includes('\0')) return false;
  return true;
}

function extractPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split('\n')) {
    const m = line.match(DIFF_PATH_RE);
    if (m) {
      const raw = m[1].trim().replace(/^"(.*)"$/, '$1');
      if (raw && raw !== '/dev/null') paths.push(raw);
    }
  }
  return paths;
}

export function applyUnifiedDiff(workspace: string, patch: string): PatchApplyResult {
  if (typeof patch !== 'string' || patch.trim().length === 0) {
    return { ok: false, appliedFiles: [], error: 'empty patch' };
  }
  const paths = extractPaths(patch);
  for (const p of paths) {
    if (!isSafeRelativePath(p)) {
      return { ok: false, appliedFiles: [], error: 'unsafe path in patch: ' + p };
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'air-patch-'));
  const patchFile = join(tmp, 'change.patch');
  writeFileSync(patchFile, patch, 'utf8');
  try {
    execFileSync('git', ['apply', '--whitespace=nowarn', patchFile], { cwd: workspace, stdio: 'pipe' });
    return { ok: true, appliedFiles: paths.filter((p) => p !== '/dev/null') };
  } catch (err: any) {
    return { ok: false, appliedFiles: [], error: String(err?.stderr ?? err?.message ?? err) };
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
