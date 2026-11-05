// Result compiler (T-027, T7-025): turns a task result into a single coherent
// user-facing reply. Never trusts worker prose; uses facts (delta, verify,
// output). Redacts before returning.
import { redact } from '../security/redact';
export function compileJobResult(facts) {
    const lines = [];
    const ok = facts.result === 'SUCCEEDED_WITH_CHANGES' || facts.result === 'SUCCEEDED_READ_ONLY' || facts.result === 'NO_CHANGES';
    lines.push(ok ? 'Done.' : `Failed (${facts.result}).`);
    if (facts.changedFiles && facts.changedFiles.length > 0) {
        lines.push(`Changed: ${facts.changedFiles.join(', ')}.`);
    }
    if (facts.verifyOk !== undefined) {
        lines.push(`Verification: ${facts.verifyOk ? 'PASS' : 'FAIL'}.`);
    }
    if (facts.durationMs !== undefined) {
        lines.push(`Duration: ${facts.durationMs}ms.`);
    }
    if (facts.verbose && facts.adapterId) {
        lines.push(`Adapter: ${facts.adapterId}.`);
    }
    if (facts.error) {
        lines.push(`Error: ${facts.error.category} - ${facts.error.message.slice(0, 200)}`);
    }
    if (facts.outputTail) {
        const tail = redact(facts.outputTail).slice(-300);
        if (tail.trim())
            lines.push(`Output: ${tail}`);
    }
    return redact(lines.join(' '));
}
