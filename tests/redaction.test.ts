import { redact, containsSecret, redactEnvContents } from '@/security/redact';
import { describe, it, expect } from 'vitest';

describe('secret redaction (G-01)', () => {
  it('redacts OpenRouter-style API keys', () => {
    const out = redact('using key sk-or-abc123def456ghi789jkl012mno345pqr');
    expect(out).not.toContain('abc123def456');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const out = redact('Authorization: Bearer super-secret-token-12345678');
    expect(out).not.toContain('super-secret-token');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts --api-key flag values', () => {
    const out = redact('aider --api-key my-openrouter-key-123456');
    expect(out).not.toContain('my-openrouter-key');
  });

  it('redacts ENV=SECRET assignments', () => {
    const out = redact('OPENAI_API_KEY=sk-1234567890abcdef');
    expect(out).not.toContain('sk-1234567890abcdef');
  });

  it('does not redact ordinary prose mentioning "429"', () => {
    const out = redact('The rate limiter returns 429 when overloaded.');
    expect(out).toContain('429');
  });

  it('detects secrets in text', () => {
    expect(containsSecret('token sk-or-abc123def456ghi789jkl012mno345pqr here')).toBe(true);
    expect(containsSecret('just some normal output')).toBe(false);
  });

  it('redacts .env file lines', () => {
    const env = 'OPENAI_API_KEY=sk-1234567890abcdef\nANTHROPIC_API_KEY=abc123secret';
    const out = redactEnvContents(env);
    expect(out).not.toContain('sk-1234567890abcdef');
    expect(out).not.toContain('abc123secret');
    expect(out).toContain('[REDACTED]');
  });
});