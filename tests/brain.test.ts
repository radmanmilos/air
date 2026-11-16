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
import { brainAnswer, isBrainAvailable, checkBrainReadiness } from '../src/brain';

/** Helper: build a fetch mock that returns appropriate responses per URL. */
function makeFetchMock(opts: {
  version?: any;
  tags?: any;
  chat?: any;
  versionStatus?: number;
  tagsStatus?: number;
  chatStatus?: number;
  throwOn?: string; // URL substring to throw on
} = {}) {
  return vi.fn(async (input: any) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    if (opts.throwOn && url.includes(opts.throwOn)) {
      throw new Error('network error');
    }
    if (url.includes('/api/version')) {
      if (opts.versionStatus && opts.versionStatus !== 200) {
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: opts.versionStatus });
      }
      return new Response(JSON.stringify(opts.version ?? { version: '0.40.16' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/tags')) {
      if (opts.tagsStatus && opts.tagsStatus !== 200) {
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: opts.tagsStatus });
      }
      return new Response(JSON.stringify(opts.tags ?? { models: [{ name: 'qwen3.5:4b' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/chat')) {
      if (opts.chatStatus && opts.chatStatus !== 200) {
        return new Response(JSON.stringify({ error: 'fail' }), { status: opts.chatStatus });
      }
      return new Response(JSON.stringify(opts.chat ?? { model: 'qwen3.5:4b', message: { role: 'assistant', content: 'local-http' }, done: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Default: throw for unknown URLs
    throw new Error('unknown url: ' + url);
  });
}

describe('brain answer path (P1-02 local-first, no external CLI egress)', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    delete process.env.AIR_BRAIN_MODEL_OLLAMA;
    delete process.env.AIR_BRAIN_OLLAMA_BASE_URL;
    delete process.env.OLLAMA_HOST;
    vi.mocked(loadConfig).mockResolvedValue({ config: DEFAULT_CONFIG as any, errors: [] });
    vi.stubGlobal('fetch', makeFetchMock());
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
    vi.stubGlobal('fetch', makeFetchMock({ throwOn: '/api/chat' }));
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
    // fetch returns health response for the env override base URL
    vi.stubGlobal('fetch', makeFetchMock());
    const r = await brainAnswer('hello');
    expect(r).toMatchObject({ provider: 'ollama', text: 'local-answer' });
    expect(spawnCalls.every((c) => c.cmd === 'ollama')).toBe(true);
    expect(spawnCalls.some((c) => c.cmd === 'kilo' || c.cmd === 'opencode')).toBe(false);
  });

  // --- Priority B: model readiness tests ---

  it('checkBrainReadiness returns ready when server and model are available', async () => {
    const r = await checkBrainReadiness();
    expect(r.available).toBe(true);
    expect(r.reason).toBe('ready');
  });

  it('checkBrainReadiness returns server_unavailable when health check fails', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ throwOn: '/api/version' }));
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('server_unavailable');
  });

  it('checkBrainReadiness returns server_unavailable when health returns non-200', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ versionStatus: 500 }));
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('server_unavailable');
  });

  it('checkBrainReadiness returns model_not_found when configured model is not installed', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ tags: { models: [{ name: 'other-model:latest' }] } }));
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('model_not_found');
    expect(r.detail).toContain('qwen3.5:4b');
  });

  it('checkBrainReadiness returns model_not_found when tags response is malformed', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ tags: { notModels: true } }));
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('server_unavailable');
  });

  it('checkBrainReadiness returns config_error when config has errors', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ config: DEFAULT_CONFIG as any, errors: ['Config validation failed: bad'] });
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('config_error');
  });

  it('checkBrainReadiness returns not_configured when localFirst is false', async () => {
    const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    cfg.models.localFirst = false;
    vi.mocked(loadConfig).mockResolvedValue({ config: cfg as any, errors: [] });
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('not_configured');
  });

  it('checkBrainReadiness returns ready for env override when server is reachable', async () => {
    process.env.AIR_BRAIN_MODEL_OLLAMA = 'fake-model';
    // fetch returns health response
    vi.stubGlobal('fetch', makeFetchMock());
    const r = await checkBrainReadiness();
    expect(r.available).toBe(true);
    expect(r.reason).toBe('ready');
  });

  it('checkBrainReadiness returns server_unavailable for env override when server is down', async () => {
    process.env.AIR_BRAIN_MODEL_OLLAMA = 'fake-model';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no http'); }));
    const r = await checkBrainReadiness();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('server_unavailable');
  });

  it('isBrainAvailable returns false when model is not installed', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ tags: { models: [{ name: 'other-model:latest' }] } }));
    await expect(isBrainAvailable()).resolves.toBe(false);
  });

  it('brainAnswer returns Acknowledged when model is not installed', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ tags: { models: [{ name: 'other-model:latest' }] } }));
    const r = await brainAnswer('hello');
    expect(r).toMatchObject({ provider: 'none', text: 'Acknowledged.' });
  });
});
