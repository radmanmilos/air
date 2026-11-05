// tests/e2e/scenarios/voice.test.ts
import { describe, it, expect } from 'vitest';
import { oracles } from '../harness/oracles';

describe('I-01: Voice spec compliance', () => {
  it('clean text has no voice violations', () => {
    const clean = 'I updated the greeting in Program.cs to say Hello AIR.';
    expect(oracles.voiceCheck(clean)).toHaveLength(0);
  });

  it('detects tool names', () => {
    const bad = 'I used aider to fix the bug with exit code 0';
    const v = oracles.voiceCheck(bad);
    expect(v).toContain('aider');
    expect(v).toContain('exit code');
  });

  it('detects model names', () => {
    const bad = 'Switched to gemma model for better results';
    const v = oracles.voiceCheck(bad);
    expect(v).toContain('gemma');
  });
});