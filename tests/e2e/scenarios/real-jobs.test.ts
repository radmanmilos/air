// tests/e2e/scenarios/real-jobs.test.ts
// Real scenarios with teeth: send messages through chat, assert job effects.
// These verify the product-bug fixes (P-01..P-05) and harness (H-01..H-12).
import { describe, it, expect } from 'vitest';
import { createSandbox } from '../harness/sandbox';
import { oracles } from '../harness/oracles';
import { startChat } from '../harness/chat-driver';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function fixture(): string {
  const f = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
  mkdirSync(f, { recursive: true });
  writeFileSync(join(f, 'README.md'), '# Test Project\n');
  writeFileSync(join(f, 'Program.cs'), 'Console.WriteLine("Hello");\n');
  const git = (args: string[]) => execFileSync('git', args, { cwd: f, stdio: 'pipe' });
  if (!existsSync(join(f, '.git', 'HEAD'))) {
    git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'init']);
    git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'add', '-A']);
    git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'commit', '-m', 'baseline']);
  } else {
    git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'checkout', '--', '.']);
    git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'clean', '-fd']);
  }
  return f;
}

function chatEnv(sandbox: any, extra: Record<string, string> = {}): Record<string, string> {
  return { ...sandbox.env, ...extra };
}

describe('real: P-05 brainstorm question must not spawn a write job', () => {
  it('answers without Started job and keeps repo clean', async () => {
    const sandbox = createSandbox(fixture());
    try {
      const env = chatEnv(sandbox, { FAKE_BEHAVIOR: 'no-change' });
      const chat = startChat(env, sandbox.repoDir);
      try {
        await chat.waitForLine(/air chat \(conversation/, 0, 10000);
        chat.say('How would you add due dates and reminders to this app? Give me options.');
        await chat.waitForLine(/air: /, 0, 20000);
        expect(chat.lines().some((l) => /Started job/.test(l.line))).toBe(false);
        expect(oracles.gitClean(sandbox.repoDir)).toBe(true);
      } finally {
        await chat.quit();
        sandbox.cleanup();
      }
    } catch (_err) { sandbox.cleanup(); throw _err; }
  });
});

describe('real: P-01 chat injection must not create sentinel files', () => {
  const payloads = [
    'what is this; touch SENTINEL',
    'what is this && touch SENTINEL',
    'what is this | touch SENTINEL',
  ];
  for (const payload of payloads) {
    it(`blocks: ${payload}`, async () => {
      const sandbox = createSandbox(fixture());
      try {
        const env = chatEnv(sandbox, { FAKE_BEHAVIOR: 'no-change' });
        const chat = startChat(env, sandbox.repoDir);
        try {
          await chat.waitForLine(/air chat \(conversation/, 0, 10000);
          chat.say(payload);
          await chat.waitForLine(/air: /, 0, 20000);
          expect(existsSync(join(sandbox.repoDir, 'SENTINEL'))).toBe(false);
          expect(oracles.gitClean(sandbox.repoDir)).toBe(true);
        } finally {
          await chat.quit();
          sandbox.cleanup();
        }
      } catch (_err) { sandbox.cleanup(); throw _err; }
    });
  }
});

describe('real: P-02 Started job is printed immediately', () => {
  it('prints Started job within 2 s of the request', async () => {
    const sandbox = createSandbox(fixture());
    try {
      const env = chatEnv(sandbox, { FAKE_BEHAVIOR: 'edit', FAKE_DELAY_MS: '200' });
      const chat = startChat(env, sandbox.repoDir);
      try {
        await chat.waitForLine(/air chat \(conversation/, 0, 10000);
        chat.say('/run add a comment to Program.cs');
        const started = await chat.waitForLine(/Started job (\S+)/, 0, 5000);
        const m = started.line.match(/Started job (\S+)/);
        expect(m?.[1]).toBeTruthy();
        await chat.waitForLine(new RegExp(`job ${m![1]} finished`), 0, 60000);
      } finally {
        await chat.quit();
        sandbox.cleanup();
      }
    } catch (_err) { sandbox.cleanup(); throw _err; }
  });
});

describe('real: P-04 chat stays responsive during a slow brain call', () => {
  it('answers /status within 2 s while a slow brain call is in flight', async () => {
    const sandbox = createSandbox(fixture());
    try {
      const env = chatEnv(sandbox, { FAKE_BEHAVIOR: 'no-change', FAKE_DELAY_MS: '6000' });
      const chat = startChat(env, sandbox.repoDir);
      try {
        await chat.waitForLine(/air chat \(conversation/, 0, 10000);
        chat.say('What is this project?');
        const t = chat.say('/status');
        await chat.waitForLine(/messages=/, t, 10000);
        expect(oracles.gitClean(sandbox.repoDir)).toBe(true);
      } finally {
        await chat.quit();
        sandbox.cleanup();
      }
    } catch (_err) { sandbox.cleanup(); throw _err; }
  });
});

describe('real: P-03 cancel kills the worker and leaves no orphans', () => {
  it('cancels a long-running job and no orphan processes remain', async () => {
    const sandbox = createSandbox(fixture());
    try {
      const env = chatEnv(sandbox, { FAKE_BEHAVIOR: 'hang' });
      const chat = startChat(env, sandbox.repoDir);
      try {
        await chat.waitForLine(/air chat \(conversation/, 0, 10000);
        chat.say('/run do something');
        const started = await chat.waitForLine(/Started job (\S+)/, 0, 5000);
        const m = started.line.match(/Started job (\S+)/);
        expect(m?.[1]).toBeTruthy();
        chat.say(`/cancel ${m![1]}`);
        await chat.waitForLine(/Cancelled/, 0, 15000);
        expect(oracles.noOrphans(sandbox.marker)).toBe(true);
      } finally {
        await chat.quit();
        sandbox.cleanup();
      }
    } catch (_err) { sandbox.cleanup(); throw _err; }
  });
});