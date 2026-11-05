// Brain: front-agent reasoning via kilocode/opencode/ollama CLI.
// Uses cross-spawn (no shell) to prevent command injection (P-01).
process.noDeprecation = true;
const KILO_MODEL = process.env.AIR_BRAIN_MODEL || 'kilo/kilo-auto/free';
const OPENCODE_MODEL = process.env.AIR_BRAIN_MODEL_OPENCODE || 'opencode/glm-5.3-flash-free';
async function spawnAsync(cmd, args, timeoutMs) {
    const crossSpawnMod = await import('cross-spawn');
    const crossSpawn = crossSpawnMod.default || crossSpawnMod;
    return new Promise((resolve) => {
        const child = crossSpawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: timeoutMs,
        });
        let stdout = '';
        child.stdout?.on('data', (d) => { stdout += d.toString(); });
        child.stderr?.on('data', () => { });
        const timer = setTimeout(() => {
            try {
                child.kill();
            }
            catch { /* noop */ }
            resolve({ stdout, status: null, error: new Error('timeout') });
        }, timeoutMs);
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ stdout, status: code, error: child.error || null });
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ stdout, status: null, error: err });
        });
    });
}
async function tryKilo(prompt) {
    try {
        const r = await spawnAsync('kilo', ['run', '--model', KILO_MODEL, '--format', 'json', prompt], 120000);
        if (r.error || r.status !== 0)
            return null;
        const lines = (r.stdout || '').split('\n').filter(Boolean);
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
async function tryOpencode(prompt) {
    try {
        const r = await spawnAsync('opencode', ['run', '--format', 'json', '--model', OPENCODE_MODEL, prompt], 120000);
        if (r.error || r.status !== 0)
            return null;
        const lines = (r.stdout || '').split('\n').filter(Boolean);
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
async function tryOllama(prompt) {
    const model = process.env.AIR_BRAIN_MODEL_OLLAMA;
    if (!model)
        return null;
    try {
        const r = await spawnAsync('ollama', ['run', model, prompt], 120000);
        if (r.error || r.status !== 0)
            return null;
        const text = (r.stdout || '').trim();
        if (text)
            return { text, model, provider: 'ollama' };
    }
    catch { /* noop */ }
    return null;
}
export async function brainAnswer(prompt, ctx) {
    const parts = [];
    if (ctx?.history && ctx.history.length > 0) {
        parts.push('Conversation history:\n' + ctx.history.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n'));
    }
    if (ctx?.jobs && ctx.jobs.length > 0) {
        parts.push('Active jobs: ' + ctx.jobs.join(', '));
    }
    const fullPrompt = parts.length > 0 ? parts.join('\n\n') + '\n\nUser: ' + prompt : prompt;
    const kilo = await tryKilo(fullPrompt);
    if (kilo)
        return kilo;
    const opencode = await tryOpencode(fullPrompt);
    if (opencode)
        return opencode;
    const ollama = await tryOllama(fullPrompt);
    if (ollama)
        return ollama;
    return { text: 'Acknowledged.', model: 'none', provider: 'none' };
}
export async function isBrainAvailable() {
    try {
        const r = await spawnAsync('kilo', ['--version'], 5000);
        if (!r.error && r.status === 0)
            return true;
    }
    catch { /* noop */ }
    try {
        const r = await spawnAsync('opencode', ['--version'], 5000);
        if (!r.error && r.status === 0)
            return true;
    }
    catch { /* noop */ }
    return !!process.env.AIR_BRAIN_MODEL_OLLAMA;
}
