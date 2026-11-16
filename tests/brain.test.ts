import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/schema';

const spawnCalls: Array<{ cmd: string; args: string[] }> = [];

vi.mock('cross-spawn', () => ({
  default: (cmd: string, args: string[]) => {
    spawnCalls.push({ cmd, args });
    const { EventEmitter } = require('node:events');
    const { Readable } = require('node:stream');
    const child: any = new EventEmitter();
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => {};
    setImmediate(() => {
      if (cmd === 'ollama' && args[0] === 'run') {
        child.stdout.push('local-answer');
        child.stdout.push(null);
        child.emit('close', 0);
      } else {
        child.stdout.push(null);
        child.emit('close', 1);
      }
    });
    return child;
  },
}));

vi.mock('../src/config/loader', () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from '../src/config/loader';
import { brainAnswer, isBrainAvailable } from '../src/brain';

describe('brain answer path (P1-02 local-first, no external CLI egress)', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    delete process.env.AIR_BRAIN_MODEL_OLLAMA;
    delete process.env.AIR_BRAIN_OLLAMA_BASE_URL;
    delete process.env.OLLAMA_HOST;
    vi.mocked(loadConfig).mockResolvedValue({ config: DEFAULT_CONFIG as any, errors: [] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'qwen3.5:4b',
      message: { role: 'assistant', content: 'local-http' },
      done: true,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('uses configured local Ollama provider and never spawns kilo/opencode', async () => {
    const r = await brainAnswer('hello');
    expect(r).toMatchObject({ provider: 'ollama', text: 'local-http' });
    expect(spawnCalls.some((c) => c.cmd === 'kilo' || c.cmd === 'opencode' || c.cmd === 'kilocode')).toBe(false);
    expect(fetch).toHaveBeenCalled();
  });

  it('reports local brain available from config without probing external CLIs', async () => {
    await expect(isBrainAvailable()).resolves.toBe(true);
    expect(spawnCalls.some((c) => c.cmd === 'kilo' || c.cmd === 'opencode')).toBe(false);
  });

  it('does not fall back to external CLIs when local provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const r = await brainAnswer('hello');
    expect(r).toMatchObject({ provider: 'none', text: 'Acknowledged.' });
    expect(spawnCalls.some((c) => c.cmd === 'kilo' || c.cmd === 'opencode' || c.cmd === 'kilocode')).toBe(false);
  });

  it('does not use external CLIs even if config cannot be loaded safely', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ config: DEFAULT_CONFIG as any, errors: ['Config validation failed: bad'] });
    await expect(isBrainAvailable()).resolves.toBe(false);
    const r = await brainAnswer('hello');
    expect(r).toMatchObject({ provider: 'none' });
    expect(spawnCalls.some((c) => c.cmd === 'kilo' || c.cmd === 'opencode')).toBe(false);
  });

  it('explicit local env override uses only local ollama CLI/provider, not external coding CLIs', async () => {
    process.env.AIR_BRAIN_MODEL_OLLAMA = 'fake';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no http'); }));
    const r = await brainAnswer('hello');
    expect(r).toMatchObject({ provider: 'ollama', text: 'local-answer' });
    expect(spawnCalls.every((c) => c.cmd === 'ollama')).toBe(true);
    expect(spawnCalls.some((c) => c.cmd === 'kilo' || c.cmd === 'opencode')).toBe(false);
  });
});
