// Secret redaction layer.
// Runs on all captured stdout/stderr before it is written to logs,
// displayed, or used for context handoff.
//
// Single choke point: every outbound text (terminal, log, trace, handoff)
// must pass through redact(). Redaction is idempotent: redact(redact(x)) == redact(x).
const REDACTED = '[REDACTED]';
// Token families (non-global detection copies).
const TOKEN_DETECT = /\b(sk-[A-Za-z0-9_-]{20,}|sk-or-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;
const JWT_DETECT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const PEM_DETECT = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/;
const BEARER_DETECT = /Bearer\s+[A-Za-z0-9._\-]{12,}/i;
const FLAG_DETECT = /(?:--api-key|--apikey|--token|--auth|--key|--password)(?:\s*=\s*|\s+)[^\s"']+/i;
const ENV_DETECT = /[A-Z][A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*(?:[^\s"']+|"[^"]*"|'[^']*')/i;
const JSONKV_DETECT = /"(?:api_?[Kk]ey|token|secret|password)"\s*:\s*"[^"]+"/i;
const CREDURL_DETECT = /:\/\/[^/\s:@]+:[^/\s@]+@/i;
// Replacement copies (global).
const TOKEN_RE = /\b(sk-[A-Za-z0-9_-]{20,}|sk-or-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PEM_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]{12,}/gi;
const FLAG_RE = /(--(?:api-key|apikey|token|auth|key|password))(?:\s*=\s*|\s+)([^\s"']+)/gi;
const ENV_RE = /[A-Z][A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*(?:[^\s"']+|"[^"]*"|'[^']*')/gi;
const JSONKV_RE = /("(?:api_?[Kk]ey|token|secret|password)"\s*:\s*")[^"]+(")/gi;
const CREDURL_RE = /(:\/\/[^/\s:@]+:)[^/\s@]+(@)/g;
export function redact(text, options = {}) {
    if (!text)
        return text;
    let out = text;
    const placeholders = [];
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
    out = out.replace(JWT_RE, REDACTED);
    out = out.replace(PEM_RE, REDACTED);
    out = out.replace(BEARER_RE, `Bearer ${REDACTED}`);
    out = out.replace(FLAG_RE, `$1=${REDACTED}`);
    out = out.replace(ENV_RE, (m) => {
        const match = m.match(/^([A-Z][A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=/i);
        return match ? `${match[1]}=${REDACTED}` : REDACTED;
    });
    out = out.replace(JSONKV_RE, `$1${REDACTED}$2`);
    out = out.replace(CREDURL_RE, `$1${REDACTED}$2`);
    for (let i = 0; i < placeholders.length; i++) {
        out = out.split(`\u0000ALLOW${i}\u0000`).join(placeholders[i]);
    }
    return out;
}
export function containsSecret(text) {
    if (!text)
        return false;
    return TOKEN_DETECT.test(text) || JWT_DETECT.test(text) || PEM_DETECT.test(text) ||
        BEARER_DETECT.test(text) || FLAG_DETECT.test(text) || ENV_DETECT.test(text) ||
        JSONKV_DETECT.test(text) || CREDURL_DETECT.test(text);
}
export function redactEnvContents(contents) {
    return contents
        .split('\n')
        .map((line) => {
        const m = line.match(/^\s*([A-Z][A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*(.*)$/i);
        if (!m)
            return line;
        return `${m[1]}=${REDACTED}`;
    })
        .join('\n');
}
