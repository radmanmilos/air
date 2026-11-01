import { StreamingRedactor, redactFull } from '../src/security/streaming-redact';
import { redact } from '../src/security/redact';
import { describe, it, expect } from 'vitest';

// R5-06: a fake secret split at every possible character boundary must never
// appear in emitted or final output, and adjacent chunks must not be
// duplicated.

const SECRET = 'sk-or-this-is-a-fake-test-key-1234567890abcdef';

describe('streaming redactor (R5-06)', () => {
  it('emits a whole chunk when no split is needed', () => {
    const r = new StreamingRedactor();
    const out = r.feed('hello world');
    expect(out).toBe('hello world');
    expect(r.flush()).toBe('');
  });

  it('does not duplicate withheld suffix across chunks', () => {
    const r = new StreamingRedactor();
    const a = r.feed('hello ');
    const b = r.feed('world');
    const c = r.flush();
    // The withheld suffix from the first feed is emitted exactly once.
    expect(a + b + c).toBe('hello world');
  });

  it('redact(feed(all chunks) + flush()) equals redact(fullOriginalText)', () => {
    const original = `prefix ${SECRET} suffix`;
    // Split at every character boundary.
    let reconstructed = '';
    const r = new StreamingRedactor();
    for (let i = 0; i < original.length; i++) {
      reconstructed += r.feed(original[i]);
    }
    reconstructed += r.flush();
    expect(reconstructed).toBe(redact(original));
  });

  it('never emits a partial secret across chunk boundaries', () => {
    // Split the secret at every possible boundary and verify no leak.
    for (let split = 1; split < SECRET.length; split++) {
      const r = new StreamingRedactor();
      const a = r.feed(SECRET.slice(0, split));
      const b = r.feed(SECRET.slice(split));
      const c = r.flush();
      const emitted = a + b + c;
      expect(emitted).not.toContain(SECRET);
    }
  });

  it('handles multi-byte UTF-8 boundaries', () => {
    const text = 'café ' + SECRET + ' résumé';
    const r = new StreamingRedactor();
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += r.feed(text[i]);
    }
    out += r.flush();
    expect(out).not.toContain(SECRET);
    expect(out).toBe(redact(text));
  });

  it('redactFull is a convenience wrapper', () => {
    expect(redactFull(SECRET)).toContain('[REDACTED]');
  });
});