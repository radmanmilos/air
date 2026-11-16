// Brain: local-first CLI chat answer path (P1-02).
// External coding CLIs (kilo/opencode) are not invoked from the default answer
// path to prevent unauthorized data egress. Answers use the configured local
// Ollama coordinator role (or explicit local AIR_BRAIN_MODEL_OLLAMA override).

process.noDeprecation = true;

import { loadConfig } from '../config/loader';
import { resolveModelRole } from '../models/role-resolver';
import { OllamaProvider } from '../models/providers/ollama';

export interface BrainResult {
  text: string;
  model: string;
  provider: string;
}

export interface BrainContext {
  history?: { role: string; content: string }[];
  jobs?: string[];
}

async function tryOllamaCli(prompt: string, model: string): Promise<BrainResult | null> {
  try {
    const crossSpawnMod: any = await import('cross-spawn');
    const crossSpawn = crossSpawnMod.default || crossSpawnMod;
    const r: { stdout: string; status: number | null; error: any } = await new Promise((resolve) => {
      const child = crossSpawn('ollama', ['run', model, prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      });
      let stdout = '';
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', () => { /* ignore */ });
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* noop */ }
        resolve({ stdout, status: null, error: new Error('timeout') });
      }, 120000);
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        resolve({ stdout, status: code, error: child.error || null });
      });
      child.on('error', (err: Error) => {
        clearTimeout(timer);
        resolve({ stdout, status: null, error: err });
      });
    });
    if (r.error || r.status !== 0) return null;
    const text = (r.stdout || '').trim();
    if (text) return { text, model, provider: 'ollama' };
  } catch { /* noop */ }
  return null;
}

async function resolveLocalBrain(): Promise<{ provider: OllamaProvider; model: string; cliOnly?: boolean } | null> {
  const envModel = process.env.AIR_BRAIN_MODEL_OLLAMA;
  if (envModel) {
    const baseUrl = process.env.AIR_BRAIN_OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    return { provider: new OllamaProvider({ baseUrl }), model: envModel, cliOnly: false };
  }
  try {
    const { config, errors } = await loadConfig();
    if (errors.some((e) => !e.startsWith('Warning:'))) return null;
    const resolved = resolveModelRole(config, 'coordinator');
    if (!resolved.localFirst) return null;
    return {
      provider: new OllamaProvider({ baseUrl: resolved.baseUrl, keepAlive: resolved.keepAlive }),
      model: resolved.model,
    };
  } catch {
    return null;
  }
}

export async function brainAnswer(prompt: string, ctx?: BrainContext): Promise<BrainResult> {
  const parts: string[] = [];
  if (ctx?.history && ctx.history.length > 0) {
    parts.push('Conversation history:\n' + ctx.history.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n'));
  }
  if (ctx?.jobs && ctx.jobs.length > 0) {
    parts.push('Active jobs: ' + ctx.jobs.join(', '));
  }
  const fullPrompt = parts.length > 0 ? parts.join('\n\n') + '\n\nUser: ' + prompt : prompt;

  const local = await resolveLocalBrain();
  if (!local) return { text: 'Acknowledged.', model: 'none', provider: 'none' };
  const envModel = process.env.AIR_BRAIN_MODEL_OLLAMA;
  if (envModel) {
    const cli = await tryOllamaCli(fullPrompt, envModel);
    if (cli) return cli;
  }
  // Fail fast when the local runtime is actually unreachable. isBrainAvailable()
  // only inspects config, so without this guard every answer blocks on the
  // provider's 120s default timeout (verified: F-02 hangs 2min per message).
  try {
    const health = await local.provider.health({ timeoutMs: 5000 });
    if (!health.online) return { text: 'Acknowledged.', model: 'none', provider: 'none' };
  } catch {
    return { text: 'Acknowledged.', model: 'none', provider: 'none' };
  }
  try {
    const result = await local.provider.chat({
      model: local.model,
      messages: [{ role: 'user', content: fullPrompt }],
      timeoutMs: 10000,
    });
    const content = result.message?.content;
    const text = typeof content === 'string' ? content.trim() : '';
    if (text) return { text, model: result.model || local.model, provider: 'ollama' };
  } catch {
    // Local provider unavailable or failed: do not fall back to external CLIs.
  }
  return { text: 'Acknowledged.', model: 'none', provider: 'none' };
}

export async function isBrainAvailable(): Promise<boolean> {
  if (process.env.AIR_BRAIN_MODEL_OLLAMA) return true;
  try {
    const { config, errors } = await loadConfig();
    if (errors.some((e) => !e.startsWith('Warning:'))) return false;
    const resolved = resolveModelRole(config, 'coordinator');
    if (!resolved.localFirst) return false;
    // Verify the Ollama runtime is actually reachable; config validity alone
    // is not enough (the daemon may be down or the model not pulled).
    const provider = new OllamaProvider({ baseUrl: resolved.baseUrl, keepAlive: resolved.keepAlive });
    const health = await provider.health({ timeoutMs: 3000 });
    return health.online;
  } catch {
    return false;
  }
}