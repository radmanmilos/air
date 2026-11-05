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
      // Use git status to include untracked files.
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
  noOrphans(marker: string): boolean {
    try {
      if (process.platform === 'win32') {
        const out = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return !out.split(/\r?\n/).some((line) => line.includes(marker));
      }
      // Unix: scan /proc for marker in cmdline or environ.
      const { readdirSync, readFileSync } = require('node:fs');
      for (const pid of readdirSync('/proc').filter((x: string) => /^\d+$/.test(x))) {
        for (const file of ['cmdline', 'environ']) {
          try {
            const buf = readFileSync(`/proc/${pid}/${file}`);
            const text = buf.toString('utf8').replace(/\0/g, ' ');
            if (text.includes(marker)) return false;
          } catch { /* noop */ }
        }
      }
      return true;
    } catch {
      return true;
    }
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