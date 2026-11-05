// Brain: front-agent reasoning via kilocode/opencode CLI.
import { execFileSync } from 'node:child_process';
const KILO_MODEL = process.env.AIR_BRAIN_MODEL || 'kilo/openrouter/free';
const OPENCODE_MODEL = process.env.AIR_BRAIN_MODEL_OPENCODE || 'opencode/beam-free';
function tryKilo(prompt) {
    try {
        const out = execFileSync('kilo', ['run', '--model', KILO_MODEL, '--format', 'json', prompt], {
            encoding: 'utf8',
            timeout: 120000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const lines = out.split('\n').filter(Boolean);
        const texts = [];
        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                if (obj.type === 'text' && obj.part?.text)
                    texts.push(obj.part.text);
            }
            catch { /* skip */ }
        }
        const text = texts.join(' ').trim();
        if (text)
            return { text, model: KILO_MODEL, provider: 'kilocode' };
    }
    catch { /* noop */ }
    return null;
}
function tryOpencode(prompt) {
    try {
        const out = execFileSync('opencode', ['run', '--format', 'json', '--model', OPENCODE_MODEL, prompt], {
            encoding: 'utf8',
            timeout: 120000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const lines = out.split('\n').filter(Boolean);
        const texts = [];
        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                if (obj.type === 'text' && obj.part?.text)
                    texts.push(obj.part.text);
            }
            catch { /* skip */ }
        }
        const text = texts.join(' ').trim();
        if (text)
            return { text, model: OPENCODE_MODEL, provider: 'opencode' };
    }
    catch { /* noop */ }
    return null;
}
const OLLAMA_MODEL = process.env.AIR_BRAIN_MODEL_OLLAMA || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
function tryOllama(prompt) {
    try {
        const out = execFileSync('ollama', ['run', OLLAMA_MODEL, prompt], {
            encoding: 'utf8',
            timeout: 120000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const text = out.trim();
        if (text)
            return { text, model: OLLAMA_MODEL, provider: 'ollama' };
    }
    catch { /* noop */ }
    return null;
}
export function brainAnswer(prompt) {
    const ollama = tryOllama(prompt);
    if (ollama)
        return ollama;
    const kilo = tryKilo(prompt);
    if (kilo)
        return kilo;
    const opencode = tryOpencode(prompt);
    if (opencode)
        return opencode;
    return { text: 'Acknowledged.', model: 'none', provider: 'none' };
}
export function isBrainAvailable() {
    try {
        execFileSync('ollama', ['--version'], { stdio: 'ignore', timeout: 5000 });
        return true;
    }
    catch {
        try {
            execFileSync('kilo', ['--version'], { stdio: 'ignore', timeout: 5000 });
            return true;
        }
        catch {
            try {
                execFileSync('opencode', ['--version'], { stdio: 'ignore', timeout: 5000 });
                return true;
            }
            catch {
                return false;
            }
        }
    }
}
