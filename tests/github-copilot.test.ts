import { GitHubCopilotAdapter } from '../src/adapters/github-copilot';
import { classifyError } from '../src/adapters/conformance';
import { describe, it, expect } from 'vitest';

describe('github-copilot adapter', () => {
  const adapter = new GitHubCopilotAdapter();

  it('advertises headless capabilities', () => {
    expect(adapter.id).toBe('github-copilot');
    expect(adapter.capabilities.headlessExecution).toBe(true);
  });

  it('builds a gh copilot command', () => {
    const spec = adapter.buildCommand({
      id: 't1',
      prompt: 'fix the bug',
      cwd: '/tmp',
      mode: 'ask',
    });
    expect(spec.executable).toBe('gh');
    expect(spec.args).toContain('copilot');
    expect(spec.args).toContain('--allow');
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
