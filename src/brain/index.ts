// Brain: front-agent reasoning via kilocode/opencode/ollama CLI.
// Uses cross-spawn (no shell) to prevent command injection (P-01).

process.noDeprecation = true;

const KILO_MODEL = process.env.AIR_BRAIN_MODEL || 'kilo/kilo-auto/free';
const OPENCODE_MODEL = process.env.AIR_BRAIN_MODEL_OPENCODE || 'opencode/glm-5.3-flash-free';

export interface BrainResult {
  text: string;
  model: string;
  provider: string;
}

async function spawnAsync(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; status: number | null; error: any }> {
  const crossSpawnMod: any = await import('cross-spawn');
  const crossSpawn = crossSpawnMod.default || crossSpawnMod;
  return new Promise((resolve) => {
    const child = crossSpawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      resolve({ stdout, status: null, error: new Error('timeout') });
    }, timeoutMs);
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve({ stdout, status: code, error: child.error || null });
    });
    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({ stdout, status: null, error: err });
    });
  });
}

async function tryKilo(prompt: string): Promise<BrainResult | null> {
  try {
    const r = await spawnAsync('kilo', ['run', '--model', KILO_MODEL, '--format', 'json', prompt], 120000);
    if (r.error || r.status !== 0) return null;
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    const texts: string[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'text' && obj.part?.text) texts.push(obj.part.text);
      } catch { /* skip */ }
    }
    const text = texts.join(' ').trim();
    if (text) return { text, model: KILO_MODEL, provider: 'kilocode' };
  } catch { /* noop */ }
  return null;
}

async function tryOpencode(prompt: string): Promise<BrainResult | null> {
  try {
    const r = await spawnAsync('opencode', ['run', '--format', 'json', '--model', OPENCODE_MODEL, prompt], 120000);
    if (r.error || r.status !== 0) return null;
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    const texts: string[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'text' && obj.part?.text) texts.push(obj.part.text);
      } catch { /* skip */ }
    }
    const text = texts.join(' ').trim();
    if (text) return { text, model: OPENCODE_MODEL, provider: 'opencode' };
  } catch { /* noop */ }
  return null;
}

async function tryOllama(prompt: string): Promise<BrainResult | null> {
  const model = process.env.AIR_BRAIN_MODEL_OLLAMA;
  if (!model) return null;
  try {
    const r = await spawnAsync('ollama', ['run', model, prompt], 120000);
    if (r.error || r.status !== 0) return null;
    const text = (r.stdout || '').trim();
    if (text) return { text, model, provider: 'ollama' };
  } catch { /* noop */ }
  return null;
}

export async function brainAnswer(prompt: string): Promise<BrainResult> {
  const kilo = await tryKilo(prompt);
  if (kilo) return kilo;
  const opencode = await tryOpencode(prompt);
  if (opencode) return opencode;
  const ollama = await tryOllama(prompt);
  if (ollama) return ollama;
  return { text: 'Acknowledged.', model: 'none', provider: 'none' };
}

export async function isBrainAvailable(): Promise<boolean> {
  try {
    const r = await spawnAsync('kilo', ['--version'], 5000);
    if (!r.error && r.status === 0) return true;
  } catch { /* noop */ }
  try {
    const r = await spawnAsync('opencode', ['--version'], 5000);
    if (!r.error && r.status === 0) return true;
  } catch { /* noop */ }
  return !!process.env.AIR_BRAIN_MODEL_OLLAMA;
}