import { StreamingRedactor } from '../src/security/streaming-redact';
import { redact } from '../src/security/redact';
import { describe, it, expect } from 'vitest';

describe('streaming redactor property', () => {
  it('concat of feeds + flush equals redact(full)', () => {
    const full = 'hello sk-abcdefghijklmnopqrstuvwxyz world';
    const r = new StreamingRedactor();
    const out = r.feed('hello sk-abc') + r.feed('defghijklmnopqrstuvwxyz world') + r.flush();
    expect(out).toBe(redact(full));
  });

  it('handles empty and no-secret chunks', () => {
    const r = new StreamingRedactor();
    expect(r.feed('') + r.flush()).toBe('');
    const r2 = new StreamingRedactor();
    expect(r2.feed('plain text') + r2.flush()).toBe('plain text');
  });
});
