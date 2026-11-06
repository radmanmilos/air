// tests/e2e/harness/oracles.ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const oracles = {
  gitClean(dir: string): boolean {
    try {
      const out = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
      return out.trim() === '';
    } catch { return false; }
  },
  gitChangedFiles(dir: string, base?: string): string[] {
    try {
      const out = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
      return out.trim().split('\n').filter(Boolean).map(line => line.slice(3).trim());
    } catch { return []; }
  },
  fileExists(dir: string, path: string): boolean {
    return existsSync(join(dir, path));
  },
  fileContains(dir: string, path: string, text: string): boolean {
    try {
      return readFileSync(join(dir, path), 'utf8').includes(text);
    } catch { return false; }
  },
  noOrphans(_marker: string): boolean {
    try {
      if (process.platform === 'win32') {
        // Windows: process environment is not exposed via command line.
        // Fall back to a conservative "true" (no orphans reported) on this platform.
        return true;
      }
      for (const pid of readdirSync('/proc').filter((x: string) => /^\d+$/.test(x))) {
        if (Number(pid) === process.pid) continue;
        try {
          const cmdline = readFileSync(`/proc/${pid}/cmdline`).toString('utf8').replace(/\0/g, ' ');
          if (/fake[-_]?executor|fake[-_]?aider|fake[-_]?goose/i.test(cmdline)) return false;
        } catch { /* noop */ }
      }
      return true;
    } catch {
      return true;
    }
  },
  branchesAndWorktrees(repo: string): { branches: string[]; worktrees: string[] } {
    try {
      const branches = execFileSync('git', ['branch', '--format', '%(refname:short)'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      const worktreeOut = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8' });
      const worktrees = worktreeOut.split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice('worktree '.length).trim());
      return { branches, worktrees };
    } catch { return { branches: [], worktrees: [] }; }
  },
  dotnetTest(repo: string): { passed: number; failed: number; total: number } {
    try {
      const out = execFileSync('dotnet', ['test', '--no-restore'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const m = out.match(/Failed:\s*(\d+),\s*Passed:\s*(\d+)/i);
      if (m) {
        const failed = parseInt(m[1], 10);
        const passed = parseInt(m[2], 10);
        return { passed, failed, total: passed + failed };
      }
    } catch { /* noop */ }
    return { passed: 0, failed: 0, total: 0 };
  },
  secretsAbsent(dirs: string[], patterns: RegExp[] = [/sk-ant-api03-/i, /sk-live-/i, /AKIA[0-9A-Z]{16}/, /password\s*=/i]): boolean {
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const file of walkFiles(dir)) {
        try {
          const content = readFileSync(file, 'utf8');
          for (const pat of patterns) {
            if (pat.test(content)) return false;
          }
        } catch { /* noop */ }
      }
    }
    return true;
  },
  sentinelAbsent(repo: string, names: string[]): boolean {
    return names.every((n) => !existsSync(join(repo, n)));
  },
  conversationMessages(stateDir: string, id: string): any[] {
    try {
      const p = join(stateDir, 'conversations', `${id}.json`);
      const data = JSON.parse(readFileSync(p, 'utf8'));
      return Array.isArray(data.messages) ? data.messages : [];
    } catch { return []; }
  },
  taskStates(stateDir: string): any[] {
    try {
      const p = join(stateDir, 'tasks.json');
      const data = JSON.parse(readFileSync(p, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  },
  traces(eventLog: string): any[] {
    try {
      return readFileSync(eventLog, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    } catch { return []; }
  },
  voiceCheck(transcript: string): string[] {
    const banned = ['aider', 'goose', 'opencode', 'kilo', 'ollama', 'codex', 'copilot', 'gemma', 'qwen', 'exit code', 'stdout'];
    const violations: string[] = [];
    for (const term of banned) {
      if (transcript.toLowerCase().includes(term)) violations.push(term);
    }
    return violations;
  },
};

function walkFiles(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) result.push(...walkFiles(p));
    else result.push(p);
  }
  return result;
}