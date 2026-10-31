import { redact, containsSecret } from '../src/security/redact';
import { describe, it, expect } from 'vitest';

describe('redaction choke point (G3-14)', () => {
  it('handles --api-key=value form', () => {
    expect(redact('use --api-key=sk-or-this-is-a-fake-test-key-1234567890abcdef')).toContain('[REDACTED]');
    expect(containsSecret('--api-key=sk-or-this-is-a-fake-test-key-1234567890abcdef')).toBe(true);
  });

  it('handles --api-key value form', () => {
    expect(redact('use --api-key sk-or-this-is-a-fake-test-key-1234567890abcdef')).toContain('[REDACTED]');
  });

  it('handles Bearer tokens', () => {
    expect(redact('Authorization: Bearer abc123def456')).toContain('Bearer [REDACTED]');
  });

  it('handles env assignments', () => {
    expect(redact('OPENROUTER_API_KEY=sk-or-this-is-a-fake-test-key-1234567890abcdef')).toContain('[REDACTED]');
  });

  it('is idempotent', () => {
    const once = redact('token sk-or-this-is-a-fake-test-key-1234567890abcdef here');
    const twice = redact(once);
    expect(once).toBe(twice);
  });

  it('containsSecret has no lastIndex state across calls', () => {
    // Calling containsSecret repeatedly with the same text must not flip
    // due to a shared global-regex lastIndex.
    const text = 'token sk-or-this-is-a-fake-test-key-1234567890abcdef here';
    for (let i = 0; i < 10; i++) {
      expect(containsSecret(text)).toBe(true);
    }
  });

  it('does not redact ordinary prose', () => {
    expect(redact('the rate limiter is working')).toBe('the rate limiter is working');
    expect(containsSecret('the rate limiter is working')).toBe(false);
  });
});