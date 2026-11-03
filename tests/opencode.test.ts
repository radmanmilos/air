import { OpenCodeAdapter } from '../src/adapters/opencode';
import { classifyError } from '../src/adapters/conformance';
import { describe, it, expect } from 'vitest';

describe('opencode adapter', () => {
  const adapter = new OpenCodeAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('opencode');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
  });

  it('builds an opencode run command with --prompt', () => {
    const spec = adapter.buildCommand({
      id: 't1',
      prompt: 'fix the bug',
      cwd: '/tmp',
      mode: 'ask',
    });
    expect(spec.executable).toBe('opencode');
    expect(spec.args).toContain('run');
    expect(spec.args).toContain('--prompt');
    expect(spec.args).toContain('fix the bug');
  });

  it('classifies rate limit from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 1, 'Error: 429 rate limit exceeded')).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 1, 'Error: 401 invalid api key')).toBe('AUTH_ERROR');
  });

  it('never classifies stdout prose as rate limit', () => {
    expect(adapter.classifyError(0, '')).toBe('UNKNOWN');
  });
});
