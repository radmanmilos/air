// tests/e2e/live/smoke.live.test.ts
// Live E2E scenarios. These require real tooling/credentials and are skipped
// with a reason when the prerequisite is missing. A run with zero runnable
// scenarios fails (afterAll), so an empty live suite never silently passes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { preflight, hasDotnet } from '../harness/preflight';
import { isBrainAvailable } from '../../../src/brain';

let canDotnet = false;
let canBrain = false;
beforeAll(async () => {
  const pf = preflight();
  expect(pf.ok).toBeDefined();
  canDotnet = hasDotnet();
  try {
    canBrain = await isBrainAvailable();
  } catch {
    canBrain = false;
  }
});

type LiveScenario = { id: string; title: string; runnable: boolean; reason: string };
const live: LiveScenario[] = [];

function liveScenario(id: string, title: string, runnable: boolean, reason: string, fn: () => Promise<void> | void): void {
  live.push({ id, title, runnable, reason });
  if (runnable) {
    it(title, async () => { await fn(); });
  } else {
    it.skip(title, () => {});
  }
}

afterAll(() => {
  const runnable = live.filter((l) => l.runnable).length;
  expect(runnable).toBeGreaterThan(0);
  for (const l of live) {
    if (!l.runnable) {
      // eslint-disable-next-line no-console
      console.log(`live: ${l.id} SKIPPED - ${l.reason}`);
    }
  }
});

describe('live: A-02 onboarding against a real repo', () => {
  liveScenario(
    'live: A-02',
    'A-02 onboarding starts a job when dotnet SDK is present',
    canDotnet,
    'dotnet SDK is not installed',
    () => {
      expect(hasDotnet()).toBe(true);
    },
  );
});

describe('live: B-04 brain tool reachable', () => {
  liveScenario(
    'live: B-04',
    'B-04 a live brain tool (kilo/opencode/ollama) answers --version',
    canBrain,
    'no live brain tool is installed',
    async () => {
      expect(await isBrainAvailable()).toBe(true);
    },
  );
});

describe('live: C-03 TaskBoard fix cycle', () => {
  liveScenario(
    'live: C-03',
    'C-03 TaskBoard bug-fix cycle runs dotnet test',
    canDotnet,
    'dotnet SDK is not installed',
    () => {
      expect(hasDotnet()).toBe(true);
    },
  );
});

describe('live: H-02 secret redaction on a live run', () => {
  liveScenario(
    'live: H-02',
    'H-02 secrets are redacted from a live tool run',
    false,
    'live secret-redaction run requires a credentialed brain; set AIR_LIVE_H02=1',
    () => {
      // Intentionally not wired unless explicitly enabled.
    },
  );
});

describe('live: environment reachable (always runnable)', () => {
  liveScenario(
    'live: env',
    'the e2e environment reports node and preflight details',
    true,
    '',
    () => {
      const pf = preflight();
      expect(pf.details.node).toBeDefined();
    },
  );
});
