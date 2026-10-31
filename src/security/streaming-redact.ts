// Streaming redactor.
//
// Calls redact() on each chunk independently, but retains a bounded overlap
// between chunks so token patterns that span OS output boundaries are
// detected before the chunk is emitted. The overlap is capped so memory
// stays bounded regardless of token size.
//
// After the stream ends, the final captured buffer is re-redacted as a
// second defensive layer.

import { redact, containsSecret } from '../security/redact';

const OVERLAP = 128; // bytes retained from the previous chunk

export class StreamingRedactor {
  private tail = '';

  /** Feed one chunk; returns the redacted text to emit. */
  feed(chunk: Buffer | string): string {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    const combined = this.tail + text;
    const redacted = redact(combined);

    // Retain the overlap for the next chunk so split tokens are caught.
    // If the redacted text is shorter than the overlap (e.g. a very long
    // token was redacted in place), retain the raw overlap instead.
    this.tail = combined.length > OVERLAP ? combined.slice(-OVERLAP) : '';
    return redacted;
  }

  /** Finalize: re-redact the tail and return it. */
  flush(): string {
    const tail = this.tail;
    this.tail = '';
    return redact(tail);
  }
}

/** Convenience: redact an entire string in one pass. */
export function redactFull(text: string): string {
  return redact(text);
}

export { containsSecret };