import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { startChat } from '../harness/chat-driver';

const ENABLED = process.env.AIR_ACCEPTANCE_LOCAL === '1';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createFixture(repoDir: string): void {
  mkdirSync(join(repoDir, 'tests'), { recursive: true });
  writeFileSync(join(repoDir, 'pricing.py'), [
    'def apply_discount(price: float, percent: float) -> float:',
    '    """Return price after applying a percentage discount."""',
    '    # BUG: treats percent as an absolute amount multiplier.',
    '    return price - (price * percent)',
    '',
  ].join('\n'));
  writeFileSync(join(repoDir, 'tests', 'test_pricing.py'), [
    'from pricing import apply_discount',
    '',
    'def test_twenty_percent_off_hundred():',
    '    assert apply_discount(100.0, 20.0) == 80.0',
    '',
    'def test_zero_percent():',
    '    assert apply_discount(50.0, 0.0) == 50.0',
    '',
  ].join('\n'));
  writeFileSync(join(repoDir, 'pyproject.toml'), [
    '[tool.pytest.ini_options]',
    'pythonpath = ["."]',
    '',
  ].join('\n'));
  writeFileSync(join(repoDir, 'README.md'), '# Pricing fixture\n');
}

describe.skipIf(!ENABLED)('acceptance: real local coding task', () => {
  it('fixes a discount bug end-to-end', async () => {
    const root = mkdtempSync(join(tmpdir(), 'air-accept-'));
    // Reset health/cooldown state for a clean run.
    const healthFile = join(process.env.LOCALAPPDATA || '', 'air', 'health.json');
    try { rmSync(healthFile, { force: true }); } catch { /* noop */ }
    const repoDir = join(root, 'repo');
    const configDir = join(root, 'config');
    const eventLog = join(root, 'events.jsonl');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    createFixture(repoDir);
    git(repoDir, ['init']);
    git(repoDir, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A']);
    git(repoDir, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'baseline']);
    const baseline = git(repoDir, ['rev-parse', 'HEAD']);

    writeFileSync(join(configDir, 'config.yaml'), [
      'version: 2',
      'permission:',
      '  allowShell: true',
      '  allowNetwork: false',
      'timeouts:',
      '  defaultMs: 600000',
      'failover:',
      '  cooldownMinutes: 0',
      'models:',
      '  localFirst: true',
      '  providers:',
      '    ollama:',
      '      enabled: true',
      '      baseUrl: http://127.0.0.1:11434',
      '  roles:',
      '    coordinator: { provider: ollama, model: qwen3.5:4b }',
      '    coder: { provider: ollama, model: qwen3.5:4b }',
      '',
    ].join('\n'));

    const env: Record<string, string> = {
      AIR_CONFIG_DIR: configDir,
      AIR_CACHE_DIR: '',
      AIR_EVENT_LOG: eventLog,
      PATH: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd;C:\\Users\\Radman Milos\\AppData\\Local\\Programs\\Ollama;C:\\Users\\Radman Milos\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts',
    };

    const chat = startChat(env, repoDir);
    let runId = '';
    try {
      await chat.waitForLine(/air chat \(conversation/, 0, 15000);
      chat.say('The apply_discount function is wrong: 20% off $100 returns -1900 instead of $80. Fix the implementation, add a regression test, and run pytest.');
      const started = await chat.waitForLine(/Started job/, 0, 120000);
      runId = (started.line.match(/Started job (\S+)/) || [])[1] || '';
      await chat.waitForLine(/finished:/, 0, 600000);
      await chat.quit();

      // Independent oracles via task state + worktree.
      const stateFile = join(process.env.LOCALAPPDATA || '', 'air', 'tasks', `${runId}.json`);
      expect(existsSync(stateFile)).toBe(true);
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      const worktree = state.worktreePath as string;
      expect(existsSync(worktree)).toBe(true);
      const worktreeDiff = execFileSync('git', ['diff', '--stat', 'HEAD'], { cwd: worktree, encoding: 'utf8' });
      const changedInWorktree = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
      const pricingContent = readFileSync(join(worktree, 'pricing.py'), 'utf8');
      let pytestExit = 0;
      let pytestOut = '';
      try {
        pytestOut = execFileSync('python', ['-m', 'pytest', '-q'], { cwd: worktree, encoding: 'utf8' });
      } catch (e: any) {
        pytestExit = e.status ?? 1;
        pytestOut = String(e.stdout || '') + String(e.stderr || '');
      }

      const report = {
        runId,
        baseline,
        changedFiles: changedInWorktree,
        diffStat: worktreeDiff,
        pytestExit,
        pytestOut: pytestOut.slice(0, 2000),
        result: state.result,
      };
      const reportDir = join(process.cwd(), 'results', 'acceptance');
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, `${runId}.json`), JSON.stringify(report, null, 2));

      expect(state.result).toBe('SUCCEEDED_WITH_CHANGES');
      expect(changedInWorktree).toContain('pricing.py');
      expect(pricingContent).toContain('/ 100');
      expect(pytestExit).toBe(0);
      expect(pytestOut).toContain('passed');
    } finally {
      // cleanup worktree
      if (runId) {
        const stateFile = join(process.env.LOCALAPPDATA || '', 'air', 'tasks', `${runId}.json`);
        if (existsSync(stateFile)) {
          const st = JSON.parse(readFileSync(stateFile, 'utf8'));
          if (st.worktreePath && existsSync(repoDir)) {
            try { execFileSync('git', ['worktree', 'remove', '--force', st.worktreePath], { cwd: repoDir, stdio: 'ignore' }); } catch { /* noop */ }
          }
        }
      }
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }, 600000);
});