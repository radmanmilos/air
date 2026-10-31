// Secret redaction layer.
// Runs on all captured stdout/stderr before it is written to logs,
// displayed, or used for context handoff.
//
// Single choke point: every outbound text (terminal, log, trace, handoff)
// must pass through redact(). Redaction is idempotent: redact(redact(x)) == redact(x).

const REDACTED = '[REDACTED]';

// Detection copies (non-global) so containsSecret() is deterministic.
const TOKEN_DETECT = /\b(sk-[A-Za-z0-9]{20,}|sk-or-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/;
const BEARER_DETECT = /Bearer\s+[A-Za-z0-9._\-]{12,}/;
const FLAG_DETECT = /(?:--api-key|--apikey|--token|--auth|--key)(?:\s*=\s*|\s+)[^\s"']+/;
const ENV_DETECT = /[A-Z][A-Z_]*_(?:KEY|TOKEN|SECRET)\s*=\s*(?:[^\s"']+|"[^"]*"|'[^']*')/;

// Replacement copies (global).
const TOKEN_RE = /\b(sk-[A-Za-z0-9]{20,}|sk-or-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]{12,}/gi;
const FLAG_RE = /(--(?:api-key|apikey|token|auth|key))(?:\s*=\s*|\s+)([^\s"']+)/gi;
const ENV_RE = /[A-Z][A-Z_]*_(?:KEY|TOKEN|SECRET)\s*=\s*(?:[^\s"']+|"[^"]*"|'[^']*')/gi;

export interface RedactionOptions {
  /** Allowlist of regex patterns whose matches must NOT be redacted. */
  allow?: RegExp[];
}

export function redact(text: string, options: RedactionOptions = {}): string {
  if (!text) return text;
  let out = text;

  // Protect allowlisted values BEFORE redaction so they survive.
  const placeholders: string[] = [];
  if (options.allow && options.allow.length > 0) {
    for (const allow of options.allow) {
      const flags = allow.flags.includes('g') ? allow.flags : allow.flags + 'g';
      const re = new RegExp(allow.source, flags);
      out = out.replace(re, (m) => {
        const idx = placeholders.length;
        const token = `\u0000ALLOW${idx}\u0000`;
        placeholders.push(m);
        return token;
      });
    }
  }

  out = out.replace(TOKEN_RE, REDACTED);
  out = out.replace(BEARER_RE, `Bearer ${REDACTED}`);
  // Flags: --key value and --key=value, including quoted values.
  out = out.replace(FLAG_RE, `$1=${REDACTED}`);
  // ENV=SECRET assignments, including quoted values.
  out = out.replace(ENV_RE, (m) => {
    const match = m.match(/^([A-Z][A-Z_]*_(?:KEY|TOKEN|SECRET))\s*=/i);
    return match ? `${match[1]}=${REDACTED}` : REDACTED;
  });

  // Restore allowlisted values.
  for (let i = 0; i < placeholders.length; i++) {
    out = out.split(`\u0000ALLOW${i}\u0000`).join(placeholders[i]);
  }

  return out;
}

/** Deterministic: uses non-global detection copies. */
export function containsSecret(text: string): boolean {
  if (!text) return false;
  return TOKEN_DETECT.test(text) || BEARER_DETECT.test(text) || FLAG_DETECT.test(text) || ENV_DETECT.test(text);
}

/** Redact .env file contents line by line, preserving keys. */
export function redactEnvContents(contents: string): string {
  return contents
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*([A-Z][A-Z_]*_(?:KEY|TOKEN|SECRET))\s*=\s*(.*)$/i);
      if (!m) return line;
      return `${m[1]}=${REDACTED}`;
    })
    .join('\n');
}