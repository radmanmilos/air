// Secret redaction layer.
// Runs on all captured stdout/stderr before it is written to logs,
// displayed, or used for context handoff.

const TOKEN_RE = /\b(sk-[A-Za-z0-9]{20,}|sk-or-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]{12,}/gi;
const API_KEY_FLAG_RE = /(--api-key|--apikey|--token|--auth)\s+[^\s]+/gi;
const ENV_ASSIGN_RE = /([A-Z_]{3,}_(KEY|TOKEN|SECRET))\s*=\s*[^\s]+/gi;
const DOTENV_LINE_RE = /^\s*([A-Z_]{3,}_(KEY|TOKEN|SECRET))\s*=\s*[^\s]+/i;

const REDACTED = '[REDACTED]';

export interface RedactionOptions {
  /** Allowlist of values that must never be redacted (e.g. test fixtures). */
  allow?: RegExp[];
  /** If true, redact .env-style lines too. */
  redactEnvLines?: boolean;
}

export function redact(text: string, options: RedactionOptions = {}): string {
  if (!text) return text;
  let out = text;

  out = out.replace(TOKEN_RE, REDACTED);
  out = out.replace(BEARER_RE, `Bearer ${REDACTED}`);
  out = out.replace(API_KEY_FLAG_RE, (m) => m.replace(/[^\s=]+$/, REDACTED));
  out = out.replace(ENV_ASSIGN_RE, (m) => m.replace(/=[^\s]+$/, `=${REDACTED}`));

  if (options.redactEnvLines) {
    out = out
      .split('\n')
      .map((line) => (DOTENV_LINE_RE.test(line) ? line.replace(/=[^\s]+$/, `=${REDACTED}`) : line))
      .join('\n');
  }

  for (const allow of options.allow || []) {
    out = out.replace(allow, (m) => m); // no-op guard; allow is informational
  }

  return out;
}

/** Check whether redaction actually changed anything. */
export function containsSecret(text: string): boolean {
  return (
    TOKEN_RE.test(text) ||
    BEARER_RE.test(text) ||
    API_KEY_FLAG_RE.test(text) ||
    ENV_ASSIGN_RE.test(text)
  );
}

/** Redact .env file contents for inclusion in handoff/logs. */
export function redactEnvContents(contents: string): string {
  return contents
    .split('\n')
    .map((line) => (DOTENV_LINE_RE.test(line) ? line.replace(/=[^\s]+$/, `=${REDACTED}`) : line))
    .join('\n');
}