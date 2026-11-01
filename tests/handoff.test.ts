import { buildHandoffPack } from '../src/context/handoff';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('handoff packer (G3-04)', () => {
  let dir: string;

  function git(args: string[]): string {
    return execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-handoff-'));
    git(['init', '-q']);
    git(['config', 'user.email', 't@t']);
    git(['config', 'user.name', 't']);
    writeFileSync(join(dir, 'a.txt'), 'initial');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'init']);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('includes branch, head, and status', () => {
    writeFileSync(join(dir, 'a.txt'), 'changed');
    const pack = buildHandoffPack({
      cwd: dir,
      prompt: 'fix the bug',
      from: { id: 'aider', provider: 'openrouter', model: 'm1' },
      to: { id: 'goose', provider: 'openai', model: 'gpt-4o' },
      mode: 'ask',
      category: 'RATE_LIMIT',
    });
    expect(pack).toContain('# air handoff');
    expect(pack).toContain('fix the bug');
    expect(pack).toContain('aider');
    expect(pack).toContain('goose');
    expect(pack).toContain('branch:');
    expect(pack).toContain('head:');
    expect(pack).toContain('a.txt');
  });

  it('redacts secrets in output tail', () => {
    const pack = buildHandoffPack({
      cwd: dir,
      prompt: 'fix',
      from: { id: 'aider', provider: 'openrouter', model: 'm1' },
      to: { id: 'goose', provider: 'openai', model: 'gpt-4o' },
      mode: 'ask',
      outputTail: 'token sk-or-this-is-a-fake-test-key-1234567890abcdef done',
    });
    expect(pack).not.toContain('sk-or-this-is-a-fake-test-key-1234567890abcdef');
    expect(pack).toContain('[REDACTED]');
  });

  it('caps diff size', () => {
    // Modify a tracked file so git diff HEAD produces output.
    writeFileSync(join(dir, 'a.txt'), 'x'.repeat(10000));
    const pack = buildHandoffPack({
      cwd: dir,
      prompt: 'fix',
      from: { id: 'aider', provider: 'openrouter', model: 'm1' },
      to: { id: 'goose', provider: 'openai', model: 'gpt-4o' },
      mode: 'ask',
      maxDiffBytes: 100,
    });
    expect(pack).toContain('[diff truncated]');
    expect(pack.length).toBeLessThan(2000);
  });

  it('includes agent-produced untracked file content when safe and size-capped (R5-07)', () => {
    writeFileSync(join(dir, 'new.txt'), 'agent output');
    const before = { isGitRepo: true, branch: 'main', head: 'h', staged: [], unstaged: [], untracked: [], dirty: false };
    const after = { isGitRepo: true, branch: 'main', head: 'h', staged: [], unstaged: [], untracked: ['new.txt'], dirty: true };
    const pack = buildHandoffPack({
      cwd: dir,
      prompt: 'fix',
      from: { id: 'aider', provider: 'openrouter', model: 'm1' },
      to: { id: 'goose', provider: 'openai', model: 'gpt-4o' },
      mode: 'ask',
      before,
      after,
    });
    expect(pack).toContain('agent output');
    expect(pack).toContain('new.txt');
  });

  it('does not include pre-existing untracked file content (R5-07)', () => {
    writeFileSync(join(dir, 'pre.txt'), 'pre-existing');
    writeFileSync(join(dir, 'new.txt'), 'agent output');
    const before = { isGitRepo: true, branch: 'main', head: 'h', staged: [], unstaged: [], untracked: ['pre.txt'], dirty: true };
    const after = { isGitRepo: true, branch: 'main', head: 'h', staged: [], unstaged: [], untracked: ['pre.txt', 'new.txt'], dirty: true };
    const pack = buildHandoffPack({
      cwd: dir,
      prompt: 'fix',
      from: { id: 'aider', provider: 'openrouter', model: 'm1' },
      to: { id: 'goose', provider: 'openai', model: 'gpt-4o' },
      mode: 'ask',
      before,
      after,
    });
    expect(pack).toContain('agent output');
    expect(pack).not.toContain('pre-existing');
  });
});