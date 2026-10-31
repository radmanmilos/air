import { redact, containsSecret, redactEnvContents } from '@/security/redact';
import { describe, it, expect } from 'vitest';

const KEY = 'sk-or-this-is-a-fake-test-key-1234567890abcdef';

describe('secret redaction (G-01, G2-09, R3-06)', () => {
  it('redacts OpenRouter-style API keys', () => {
    const out = redact(`using key ${KEY}`);
    expect(out).not.toContain('abcdef');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const out = redact('Authorization: Bearer super-secret-token-12345678');
    expect(out).not.toContain('super-secret-token');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts --api-key value form', () => {
    const out = redact(`aider --api-key ${KEY}`);
    expect(out).not.toContain('abcdef');
  });

  it('redacts --api-key=value form', () => {
    const out = redact(`aider --api-key=${KEY}`);
    expect(out).not.toContain('abcdef');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts --token=value form', () => {
    const out = redact(`--token=${KEY}`);
    expect(out).not.toContain('abcdef');
  });

  it('redacts ENV=SECRET assignments', () => {
    const out = redact(`OPENAI_API_KEY=${KEY}`);
    expect(out).not.toContain('abcdef');
  });

  it('redacts quoted .env values with spaces', () => {
    const out = redactEnvContents('MY_SECRET="a secret with spaces here"');
    expect(out).not.toContain('a secret with spaces');
    expect(out).toContain('[REDACTED]');
  });

  it('does not redact ordinary prose mentioning "429"', () => {
    const out = redact('The rate limiter returns 429 when overloaded.');
    expect(out).toContain('429');
  });

  it('containsSecret is deterministic across repeated calls', () => {
    const text = `token ${KEY} here`;
    const results = [containsSecret(text), containsSecret(text), containsSecret(text)];
    expect(results.every((r) => r === true)).toBe(true);
    expect(containsSecret('just some normal output')).toBe(false);
  });

  it('redaction is idempotent', () => {
    const once = redact(`key ${KEY}`);
    const twice = redact(once);
    expect(once).toBe(twice);
  });

  it('allow option protects allowlisted values', () => {
    const out = redact(`key ${KEY}`, { allow: [new RegExp(KEY)] });
    expect(out).toContain(KEY);
  });

  it('multiple secrets in one line are all redacted', () => {
    const out = redact(`k1=${KEY} k2=${KEY}`);
    expect(out.match(/\[REDACTED\]/g)?.length).toBe(2);
  });
});