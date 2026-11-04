// Normalized process outcome owned by the shared process runner.
// Process facts (timedOut, cancelled, spawnError) take precedence over
// generic adapter stderr matching.
export function classifyOutcome(outcome) {
    if (outcome.cancelled)
        return { category: 'USER_CANCELLED' };
    if (outcome.timedOut)
        return { category: 'TIMEOUT' };
    if (outcome.spawnError) {
        const code = outcome.spawnError.code || '';
        if (code === 'ENOENT' || /not found|not installed/i.test(outcome.spawnError.message)) {
            return { category: 'TOOL_NOT_INSTALLED' };
        }
        return { category: 'PROCESS_CRASH' };
    }
    if (outcome.signal)
        return { category: 'PROCESS_CRASH' };
    return { category: null };
}
/** Count UTF-8 bytes of a string. */
export function utf8Bytes(s) {
    return Buffer.byteLength(s, 'utf8');
}
/** Append a chunk to a rolling tail buffer, keeping only the last `cap` bytes. */
export function appendTail(buf, chunk, cap) {
    const next = buf + chunk;
    const bytes = utf8Bytes(next);
    if (bytes <= cap) {
        return { content: next, bytes, truncated: false, fullTruncated: false };
    }
    // Keep the tail: drop bytes from the front until we are under the cap.
    let out = next;
    while (utf8Bytes(out) > cap) {
        out = out.slice(1);
    }
    return { content: out, bytes: utf8Bytes(out), truncated: true, fullTruncated: true };
}
