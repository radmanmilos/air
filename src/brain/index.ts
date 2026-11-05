// Brain: front-agent reasoning via kilocode CLI.

import { execFileSync } from 'node:child_process';

const DEFAULT_MODEL = process.env.AIR_BRAIN_MODEL || 'kilo/openrouter/free';

export interface BrainResult {
  text: string;
  model: string;
}

export function brainAnswer(prompt: string, model: string = DEFAULT_MODEL): BrainResult {
  try {
    const out = execFileSync('kilo', ['run', '--model', model, '--format', 'json', prompt], {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // Parse JSON lines, extract text.
    const lines = out.split('\n').filter(Boolean);
    const texts: string[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'text' && obj.part?.text) texts.push(obj.part.text);
      } catch { /* skip non-JSON */ }
    }
    const text = texts.join(' ').trim();
    return { text: text || 'Acknowledged.', model };
  } catch (err: any) {
    return { text: 'Acknowledged.', model };
  }
}

export function isBrainAvailable(): boolean {
  try {
    execFileSync('kilo', ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}