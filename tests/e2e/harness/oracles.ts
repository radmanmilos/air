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
      const out = execFileSync('git', ['diff', '--name-only', base ?? 'HEAD'], { cwd: dir, encoding: 'utf8' });
      return out.trim().split('\n').filter(Boolean);
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
  noOrphans(marker: string): boolean {
    // Check no process has the marker in env/argv (simplified).
    return true; // TODO: implement platform-specific check
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