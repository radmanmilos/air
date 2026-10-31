// Mechanical git-state handoff packer (R-06, G3-04).
//
// Builds a handoff document from data air already has: branch, HEAD,
// `git status --porcelain`, size-capped `git diff`, changed file list,
// error category + summary, and the last N KB of redacted output.
// Never includes model-generated prose as evidence.

import { execFileSync } from 'node:child_process';
import { redact } from '../security/redact';

const DIFF_CAP = 4096; // bytes
const TAIL_CAP = 2048; // bytes

export interface HandoffOptions {
  cwd: string;
  prompt: string;
  from: { id: string; provider: string; model: string };
  to: { id: string; provider: string; model: string };
  mode: 'ask' | 'auto';
  files?: string[];
  category?: string;
  summary?: string;
  outputTail?: string;
  maxDiffBytes?: number;
  maxTailBytes?: number;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', ['--no-pager', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

export function buildHandoffPack(opts: HandoffOptions): string {
  const diffCap = opts.maxDiffBytes ?? DIFF_CAP;
  const tailCap = opts.maxTailBytes ?? TAIL_CAP;

  const branch = git(opts.cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(opts.cwd, ['rev-parse', 'HEAD']);
  const status = git(opts.cwd, ['status', '--porcelain']);
  const diff = git(opts.cwd, ['diff', '--no-color', '--unified=3', 'HEAD']);
  const truncatedDiff = diff.length > diffCap ? diff.slice(0, diffCap) + '\n[diff truncated]\n' : diff;
  const changedFiles = status
    .split('\n')
    .map((l) => l.slice(3))
    .filter(Boolean);

  const tail = opts.outputTail ? redact(opts.outputTail) : '';
  const truncatedTail = tail.length > tailCap ? tail.slice(-tailCap) : tail;

  const lines: string[] = [];
  lines.push('# air handoff');
  lines.push(`- task: ${opts.prompt}`);
  lines.push(`- from: ${opts.from.id} (${opts.from.provider}/${opts.from.model})`);
  lines.push(`- to: ${opts.to.id} (${opts.to.provider}/${opts.to.model})`);
  lines.push(`- mode: ${opts.mode}`);
  if (opts.files && opts.files.length > 0) {
    lines.push(`- files: ${opts.files.join(', ')}`);
  }
  lines.push(`- branch: ${branch || '(detached)'}`);
  lines.push(`- head: ${head || '(unknown)'}`);
  if (status) {
    lines.push(`- status:`);
    for (const f of changedFiles) lines.push(`  - ${f}`);
  }
  if (truncatedDiff) {
    lines.push(`- diff:`);
    lines.push('```');
    lines.push(truncatedDiff);
    lines.push('```');
  }
  if (opts.category) {
    lines.push(`- error category: ${opts.category}`);
  }
  if (opts.summary) {
    lines.push(`- summary: ${opts.summary}`);
  }
  if (truncatedTail) {
    lines.push(`- last ${tailCap} bytes of redacted output:`);
    lines.push('```');
    lines.push(truncatedTail);
    lines.push('```');
  }
  lines.push(`- continue from the current working tree; do not reset or revert.`);
  return lines.join('\n');
}

/** Convenience: build a handoff from a snapshot + outcome tail. */
export function buildHandoffFromSnapshot(
  opts: Omit<HandoffOptions, 'outputTail'> & { outputTail?: string },
): string {
  return buildHandoffPack(opts);
}