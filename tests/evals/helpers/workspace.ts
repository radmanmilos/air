import { cp, lstat, mkdir, mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAYLOAD_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/payloads/workspaces',
);

export interface EvalWorkspace {
  /** Absolute path to the isolated copy of the fixture project. */
  path: string;
  /** Stable fixture directory name. */
  fixtureName: string;
  /** Remove the temporary parent directory. Safe to call more than once. */
  cleanup(): Promise<void>;
}

export interface CreateEvalWorkspaceOptions {
  /** Optional parent for temporary directories; defaults to the OS temp directory. */
  tempRoot?: string;
}

async function assertNoSymlinks(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('Evaluation fixtures must not contain symbolic links: ' + entryPath);
    }
    if (entry.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

/**
 * Copy a named, repository-owned fixture into a fresh temporary workspace.
 *
 * The fixture name is a single safe path segment; source paths are resolved
 * and checked against the payload root. The shared fixture is never mutated.
 */
export async function createEvalWorkspace(
  fixtureName: string,
  options: CreateEvalWorkspaceOptions = {},
): Promise<EvalWorkspace> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(fixtureName)) {
    throw new Error('Invalid evaluation fixture name: ' + fixtureName);
  }

  const payloadRoot = await realpath(PAYLOAD_ROOT);
  const sourcePath = resolve(payloadRoot, fixtureName);
  const sourceInfo = await lstat(sourcePath);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isDirectory()) {
    throw new Error('Evaluation fixture must be a real directory: ' + fixtureName);
  }

  const source = await realpath(sourcePath);
  const sourceRelative = relative(payloadRoot, source);
  if (!sourceRelative || sourceRelative.startsWith('..') || isAbsolute(sourceRelative)) {
    throw new Error('Evaluation fixture resolves outside the payload root: ' + fixtureName);
  }
  await assertNoSymlinks(source);
  await stat(source);

  const parent = resolve(options.tempRoot ?? tmpdir());
  await mkdir(parent, { recursive: true });
  const container = await mkdtemp(join(parent, 'air-eval-'));
  const workspace = join(container, fixtureName);

  try {
    await cp(source, workspace, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
    });
  } catch (error) {
    await rm(container, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  let cleaned = false;
  return {
    path: workspace,
    fixtureName,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(container, { recursive: true, force: true });
    },
  };
}
