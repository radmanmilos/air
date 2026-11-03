import { CodexAdapter } from '../src/adapters/codex';
import { classifyError } from '../src/adapters/conformance';
import { describe, it, expect } from 'vitest';

describe('codex adapter', () => {
  const adapter = new CodexAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('codex');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
  });

  it('builds a codex exec command', () => {
    const spec = adapter.buildCommand({
      id: 't1',
      prompt: 'fix the bug',
      cwd: '/tmp',
      mode: 'ask',
    });
    expect(spec.executable).toBe('codex');
    expect(spec.args).toContain('exec');
    expect(spec.args).toContain('--skip-git-repo-check');
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
