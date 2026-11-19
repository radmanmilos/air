// Brain: local-first CLI chat answer path (P1-02).
// External coding CLIs (kilo/opencode) are not invoked from the default answer
// path to prevent unauthorized data egress. Answers use the configured local
// Ollama coordinator role (or explicit local AIR_BRAIN_MODEL_OLLAMA override).
process.noDeprecation = true;
import { loadConfig } from '../config/loader.js';
import { resolveModelRole } from '../models/role-resolver.js';
import { OllamaProvider } from '../models/providers/ollama.js';
async function tryOllamaCli(prompt, model) {
    try {
        const crossSpawnMod = await import('cross-spawn');
        const crossSpawn = crossSpawnMod.default || crossSpawnMod;
        const r = await new Promise((resolve) => {
            const child = crossSpawn('ollama', ['run', model, prompt], {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 10000,
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
            }, 10000);
            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({ stdout, status: code, error: child.error || null });
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                resolve({ stdout, status: null, error: err });
            });
        });
        if (r.error || r.status !== 0)
            return null;
        const text = (r.stdout || '').trim();
        if (text)
            return { text, model, provider: 'ollama' };
    }
    catch { /* noop */ }
    return null;
}
async function resolveLocalBrain() {
    const envModel = process.env.AIR_BRAIN_MODEL_OLLAMA;
    if (envModel) {
        const baseUrl = process.env.AIR_BRAIN_OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
        return { provider: new OllamaProvider({ baseUrl }), model: envModel, cliOnly: false };
    }
    try {
        const { config, errors } = await loadConfig();
        if (errors.some((e) => !e.startsWith('Warning:')))
            return null;
        const resolved = resolveModelRole(config, 'coordinator');
        if (!resolved.localFirst)
            return null;
        return {
            provider: new OllamaProvider({ baseUrl: resolved.baseUrl, keepAlive: resolved.keepAlive }),
            model: resolved.model,
        };
    }
    catch {
        return null;
    }
}
/**
 * Check whether the local brain can answer. Distinguishes server reachability
 * from model availability so callers can report a clear, non-sensitive reason.
 */
export async function checkBrainReadiness() {
    const envModel = process.env.AIR_BRAIN_MODEL_OLLAMA;
    if (envModel) {
        // Explicit local override: verify the Ollama runtime is reachable for the
        // configured base URL. We cannot verify the specific model is installed
        // (it may be a CLI-only model), but the server must respond.
        const baseUrl = process.env.AIR_BRAIN_OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
        const provider = new OllamaProvider({ baseUrl });
        try {
            const health = await provider.health({ timeoutMs: 3000 });
            if (!health.online)
                return { available: false, reason: 'server_unavailable', detail: 'Ollama not responding' };
        }
        catch (err) {
            return { available: false, reason: 'server_unavailable', detail: String(err) };
        }
        return { available: true, reason: 'ready' };
    }
    let config;
    let errors;
    try {
        const result = await loadConfig();
        config = result.config;
        errors = result.errors;
    }
    catch (err) {
        return { available: false, reason: 'config_error', detail: String(err) };
    }
    if (errors.some((e) => !e.startsWith('Warning:'))) {
        return { available: false, reason: 'config_error', detail: errors.join('; ') };
    }
    let resolved;
    try {
        resolved = resolveModelRole(config, 'coordinator');
    }
    catch (err) {
        return { available: false, reason: 'config_error', detail: String(err) };
    }
    if (!resolved.localFirst) {
        return { available: false, reason: 'not_configured', detail: 'localFirst is false' };
    }
    const provider = new OllamaProvider({ baseUrl: resolved.baseUrl, keepAlive: resolved.keepAlive });
    // 1. Server reachability.
    let health;
    try {
        health = await provider.health({ timeoutMs: 3000 });
    }
    catch (err) {
        return { available: false, reason: 'server_unavailable', detail: String(err) };
    }
    if (!health.online) {
        return { available: false, reason: 'server_unavailable', detail: 'Ollama not responding' };
    }
    // 2. Model availability.
    let models;
    try {
        models = await provider.listModels({ timeoutMs: 5000 });
    }
    catch (err) {
        return { available: false, reason: 'server_unavailable', detail: String(err) };
    }
    const modelAvailable = models.some((m) => m.name === resolved.model);
    if (!modelAvailable) {
        return { available: false, reason: 'model_not_found', detail: `Model ${resolved.model} not installed (${models.length} models found)` };
    }
    return { available: true, reason: 'ready' };
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
    // Check readiness first (server + model).
    const readiness = await checkBrainReadiness();
    if (!readiness.available) {
        const detail = readiness.detail ? `: ${readiness.detail}` : '';
        return { text: `AI unavailable (${readiness.reason})${detail}`, model: 'none', provider: 'none' };
    }
    const local = await resolveLocalBrain();
    if (!local) {
        return { text: 'AI unavailable (config_error): could not resolve local coordinator', model: 'none', provider: 'none' };
    }
    const envModel = process.env.AIR_BRAIN_MODEL_OLLAMA;
    if (envModel) {
        const cli = await tryOllamaCli(fullPrompt, envModel);
        if (cli)
            return cli;
    }
    try {
        const result = await local.provider.chat({
            model: local.model,
            messages: [{ role: 'user', content: fullPrompt }],
            timeoutMs: 10000,
        });
        const content = result.message?.content;
        const text = typeof content === 'string' ? content.trim() : '';
        if (text)
            return { text, model: result.model || local.model, provider: 'ollama' };
        return { text: 'AI returned an empty response.', model: local.model, provider: 'ollama' };
    }
    catch (err) {
        return { text: `AI request failed: ${String(err?.message || err)}`, model: 'none', provider: 'none' };
    }
}
export async function isBrainAvailable() {
    const readiness = await checkBrainReadiness();
    return readiness.available;
}
