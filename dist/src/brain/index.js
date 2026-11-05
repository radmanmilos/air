// Brain: front-agent reasoning via kilocode CLI.
import { execFileSync } from 'node:child_process';
const DEFAULT_MODEL = process.env.AIR_BRAIN_MODEL || 'kilo/openrouter/free';
export function brainAnswer(prompt, model = DEFAULT_MODEL) {
    try {
        const out = execFileSync('kilo', ['run', '--model', model, '--format', 'json', prompt], {
            encoding: 'utf8',
            timeout: 120000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        // Parse JSON lines, extract text.
        const lines = out.split('\n').filter(Boolean);
        const texts = [];
        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                if (obj.type === 'text' && obj.part?.text)
                    texts.push(obj.part.text);
            }
            catch { /* skip non-JSON */ }
        }
        const text = texts.join(' ').trim();
        return { text: text || 'Acknowledged.', model };
    }
    catch (err) {
        return { text: 'Acknowledged.', model };
    }
}
export function isBrainAvailable() {
    try {
        execFileSync('kilo', ['--version'], { stdio: 'ignore', timeout: 5000 });
        return true;
    }
    catch {
        return false;
    }
}
