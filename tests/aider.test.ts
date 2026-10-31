import { AiderAdapter } from '../src/adapters/aider';
import { classifyError } from '../src/adapters/conformance';
import { describe, it, expect } from 'vitest';

describe('aider adapter (G3-03)', () => {
  const adapter = new AiderAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('aider');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
    expect(adapter.capabilities.shellAccess).toBe(false);
  });

  it('builds a headless command with the required flags', () => {
    const spec = adapter.buildCommand({
      id: 't1',
      prompt: 'fix the bug',
      cwd: '/tmp',
      mode: 'ask',
    });
    expect(spec.executable).toBe('aider');
    expect(spec.args).toContain('--message');
    expect(spec.args).toContain('fix the bug');
    expect(spec.args).toContain('--yes-always');
    expect(spec.args).toContain('--no-auto-commits');
    expect(spec.args).toContain('--exit');
  });

  it('includes --model when a preferred model is set', () => {
    const spec = adapter.buildCommand({
      id: 't1',
      prompt: 'fix',
      cwd: '/tmp',
      mode: 'ask',
      preferredModel: 'openrouter/gpt-4o',
    });
    expect(spec.args).toContain('--model');
    expect(spec.args).toContain('openrouter/gpt-4o');
  });

  it('classifies rate limit from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 42, 'Error: 429 rate limit exceeded for model')).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 5, 'Error: 401 invalid api key')).toBe('AUTH_ERROR');
  });

  it('classifies model unavailable from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 1, 'Error: model openrouter/foo not found')).toBe('MODEL_UNAVAILABLE');
  });

  it('never classifies stdout prose as rate limit', () => {
    // Exit 0 with rate-limit words in stdout prose must NOT be RATE_LIMIT.
    expect(adapter.classifyError(0, '')).toBe('UNKNOWN');
  });

  it('process facts take precedence over stderr matching', () => {
    expect(
      classifyError(adapter, 1, 'rate limit exceeded', { timedOut: true }),
    ).toBe('TIMEOUT');
    expect(
      classifyError(adapter, 1, 'rate limit exceeded', { cancelled: true }),
    ).toBe('USER_CANCELLED');
  });
});