// Suppress execFileSync shell deprecation warning.
process.noDeprecation = true;

import { execFileSync } from 'node:child_process';

const KILO_MODEL = process.env.AIR_BRAIN_MODEL || 'kilo/nvidia/nemotron-3-ultra-550b-a55b:free';
const OPENCODE_MODEL = process.env.AIR_BRAIN_MODEL_OPENCODE || 'opencode/glm-5.3-flash-free';

export interface BrainResult {
  text: string;
  model: string;
  provider: string;
}

function tryKilo(prompt: string): BrainResult | null {
  try {
    const out = execFileSync('kilo', ['run', '--model', KILO_MODEL, '--format', 'json', prompt], {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      shell: true,
    });
    const lines = out.split('\n').filter(Boolean);
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

function tryOpencode(prompt: string): BrainResult | null {
  try {
    const out = execFileSync('opencode', ['run', '--format', 'json', '--model', OPENCODE_MODEL, prompt], {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      shell: true,
    });
    const lines = out.split('\n').filter(Boolean);
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

function tryOllama(prompt: string): BrainResult | null {
  const model = process.env.AIR_BRAIN_MODEL_OLLAMA;
  if (!model) return null;
  try {
    const out = execFileSync('ollama', ['run', model, prompt], {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      shell: true,
    });
    const text = out.trim();
    if (text) return { text, model, provider: 'ollama' };
  } catch { /* noop */ }
  return null;
}

export function brainAnswer(prompt: string): BrainResult {
  const kilo = tryKilo(prompt);
  if (kilo) return kilo;
  const opencode = tryOpencode(prompt);
  if (opencode) return opencode;
  const ollama = tryOllama(prompt);
  if (ollama) return ollama;
  return { text: 'Acknowledged.', model: 'none', provider: 'none' };
}

export function isBrainAvailable(): boolean {
  try {
    execFileSync('kilo', ['--version'], { stdio: 'ignore', timeout: 5000, shell: true, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    return true;
  } catch {
    try {
      execFileSync('opencode', ['--version'], { stdio: 'ignore', timeout: 5000, shell: true, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
      return true;
    } catch {
      return !!process.env.AIR_BRAIN_MODEL_OLLAMA;
    }
  }
}