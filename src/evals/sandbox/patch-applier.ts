// Unified-diff application confined to a single workspace directory.
//
// All paths in the patch must be relative and may not escape the workspace.
// Symlinks/reparse points inside the workspace are rejected to prevent
// confinement bypass. Application is performed with `git apply` after path
// validation. The repository working tree is never touched.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, normalize, sep } from 'node:path';

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
  if (norm === '..' || norm.startsWith('..' + sep)) return false;
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

// Ensure that no existing path component inside the workspace is a symlink or
// reparse point, and that the resolved target stays under the workspace root.
function confinedPath(root: string, rel: string): { ok: boolean; error?: string } {
  if (rel === '/dev/null') return { ok: true };
  const parts = rel.split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (part === '..') return { ok: false, error: 'path traversal: ' + rel };
    const candidate = join(current, part);
    try {
      const st = lstatSync(candidate);
      if (st.isSymbolicLink()) {
        return { ok: false, error: 'symlink/reparse point in path: ' + rel };
      }
    } catch {
      // component does not exist yet; remaining components will be created by git apply
      return { ok: true };
    }
    current = candidate;
  }
  // Final canonical check for existing target.
  try {
    const resolved = realpathSync(join(root, rel));
    const rootResolved = realpathSync(root);
    if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) {
      return { ok: false, error: 'path escapes workspace: ' + rel };
    }
  } catch {
    // target does not exist yet; parent confinement already checked above
  }
  return { ok: true };
}

export function applyUnifiedDiff(workspace: string, patch: string): PatchApplyResult {
  if (typeof patch !== 'string' || patch.trim().length === 0) {
    return { ok: false, appliedFiles: [], error: 'empty patch' };
  }
  let root: string;
  try {
    root = realpathSync(workspace);
  } catch (err) {
    return { ok: false, appliedFiles: [], error: 'invalid workspace: ' + String(err) };
  }
  // Reject a symlinked workspace root.
  try {
    if (lstatSync(workspace).isSymbolicLink()) {
      return { ok: false, appliedFiles: [], error: 'workspace root is a symlink' };
    }
  } catch (err) {
    return { ok: false, appliedFiles: [], error: 'invalid workspace: ' + String(err) };
  }

  const paths = extractPaths(patch);
  for (const p of paths) {
    if (!isSafeRelativePath(p)) {
      return { ok: false, appliedFiles: [], error: 'unsafe path in patch: ' + p };
    }
    const confinement = confinedPath(root, p);
    if (!confinement.ok) {
      return { ok: false, appliedFiles: [], error: confinement.error };
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'air-patch-'));
  const patchFile = join(tmp, 'change.patch');
  writeFileSync(patchFile, patch, 'utf8');
  try {
    execFileSync('git', ['apply', '--whitespace=nowarn', patchFile], { cwd: root, stdio: 'pipe' });
    return { ok: true, appliedFiles: paths.filter((p) => p !== '/dev/null') };
  } catch (err: any) {
    return { ok: false, appliedFiles: [], error: String(err?.stderr ?? err?.message ?? err) };
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
