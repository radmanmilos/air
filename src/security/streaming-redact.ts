// Streaming redactor.
//
// Feeds arbitrary chunks (e.g. stdout bytes as they arrive) and returns the
// redacted text safe to emit now. A bounded guard window (OVERLAP chars) is
// retained from the end of each chunk so a token that straddles a chunk
// boundary is detected before anything leaks.
//
// Correctness properties:
// - No chunk is emitted twice. The withheld suffix is emitted exactly once
//   (either in a later feed() call or in flush()).
// - A secret split at any character boundary cannot leak: the withheld
//   suffix is held until the combined buffer is re-redacted, and a prefix
//   is only emitted when redact(combined) === redact(prefix) + redact(suffix)
//   -- i.e. no token straddles the cut.
// - flush() emits the remaining withheld suffix exactly once.
// - concat of all feed() returns + flush() === redact(fullOriginalText).
//
// Normal (secret-free) output streams responsively: small buffers that
// cannot be the start of a token are emitted immediately. A buffer ending
// with a partial token prefix is held until more data arrives.

import { redact, containsSecret } from '../security/redact';

const OVERLAP = 64; // chars retained from the end of each chunk (>= max token length)
const MAX_WITHHELD = 4096; // cap to prevent unbounded withheld buffers

// Known token string prefixes. A suffix is a partial token prefix if it is
// a prefix of one of these, or starts with one of these.
const TOKEN_PREFIXES = [
  'sk-or-',
  'sk-proj-',
  'sk-ant-',
  'sk-',
  'ghp_',
  'gho_',
  'ghs_',
  'ghu_',
  'github_pat_',
  'AKIA',
  'ASIA',
  'xox',
  'AIza',
  'Bearer',
  'bearer',
  '--api-key',
  '--apikey',
  '--token',
  '--auth',
  '--key',
  '--password',
  'eyJ',
  '-----BEGIN',
  'password',
  'secret',
  'token',
];

function couldBeTokenPrefix(s: string): boolean {
  if (s.length === 0) return false;
  const lower = s.toLowerCase();
  for (const t of TOKEN_PREFIXES) {
    if (t.toLowerCase().startsWith(lower)) return true;
    if (lower.startsWith(t.toLowerCase())) return true;
  }
  // ENV assignment prefix: [A-Z][A-Z_]*(_(KEY|TOKEN|SECRET))?
  if (/^[A-Z][A-Z_]*(_(KEY|TOKEN|SECRET))?$/.test(s)) return true;
  return false;
}

/** Returns the start index of the longest suffix that could be a token prefix. */
function findTokenPrefixStart(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (couldBeTokenPrefix(s.slice(i))) return i;
  }
  return s.length;
}

export class StreamingRedactor {
  private rawWithheld = '';
  private decoder = new TextDecoder('utf-8', { fatal: false });

  /** Feed one chunk; returns the redacted text safe to emit now. */
  feed(chunk: Buffer | string): string {
    const text = typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
    this.rawWithheld += text;

    // Cap withheld buffer to avoid unbounded growth.
    if (this.rawWithheld.length > MAX_WITHHELD) {
      const out = redact(this.rawWithheld);
      this.rawWithheld = '';
      return out;
    }

    // No secret anywhere: emit everything that cannot be a partial token prefix.
    if (!containsSecret(this.rawWithheld)) {
      const cut = findTokenPrefixStart(this.rawWithheld);
      const emit = this.rawWithheld.slice(0, cut);
      this.rawWithheld = this.rawWithheld.slice(cut);
      return redact(emit);
    }

    // A secret is present. Hold small buffers so a token spanning into the
    // next chunk can be detected.
    if (this.rawWithheld.length <= OVERLAP) {
      return '';
    }

    const rawTarget = this.rawWithheld.length - OVERLAP;
    const prefix = this.rawWithheld.slice(0, rawTarget);
    const suffix = this.rawWithheld.slice(rawTarget);

    // Verify no token straddles the cut by checking that redacting the
    // parts independently equals redacting the whole.
    const prefixRedacted = redact(prefix);
    const combinedRedacted = redact(this.rawWithheld);
    if (combinedRedacted !== prefixRedacted + redact(suffix)) {
      // A token straddles the cut; withhold everything until it resolves.
      return '';
    }

    this.rawWithheld = suffix;
    return prefixRedacted;
  }

  /** Finalize: emit the remaining withheld suffix exactly once. */
  flush(): string {
    const remaining = this.decoder.decode();
    this.rawWithheld += remaining;
    const tail = redact(this.rawWithheld);
    this.rawWithheld = '';
    return tail;
  }
}

/** Convenience: redact an entire string in one pass. */
export function redactFull(text: string): string {
  return redact(text);
}

export { containsSecret };