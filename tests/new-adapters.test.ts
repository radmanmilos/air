import { OpenCodeAdapter } from '../src/adapters/opencode';
import { KilocodeAdapter } from '../src/adapters/kilocode';
import { CodexAdapter } from '../src/adapters/codex';
import { GitHubCopilotAdapter } from '../src/adapters/github-copilot';
import { classifyError } from '../src/adapters/conformance';
import { describe, it, expect } from 'vitest';

describe('opencode adapter (UNVERIFIED spike)', () => {
  const adapter = new OpenCodeAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('opencode');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
  });

  it('builds a headless command with --prompt and --yes', () => {
    const spec = adapter.buildCommand({
      id: 't1', prompt: 'fix the bug', cwd: '/tmp', mode: 'ask',
    });
    expect(spec.executable).toBe('opencode');
    expect(spec.args).toContain('run');
    expect(spec.args).toContain('--prompt');
    expect(spec.args).toContain('fix the bug');
    expect(spec.args).toContain('--yes');
  });

  it('classifies rate limit from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 42, 'Error: 429 rate limit exceeded')).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 5, 'Error: 401 invalid api key')).toBe('AUTH_ERROR');
  });

  it('process facts take precedence over stderr matching', () => {
    expect(classifyError(adapter, 1, 'rate limit exceeded', { timedOut: true })).toBe('TIMEOUT');
    expect(classifyError(adapter, 1, 'rate limit exceeded', { cancelled: true })).toBe('USER_CANCELLED');
  });
});

describe('kilocode adapter (UNVERIFIED spike)', () => {
  const adapter = new KilocodeAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('kilocode');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
  });

  it('builds a headless command with --prompt and --yes', () => {
    const spec = adapter.buildCommand({
      id: 't1', prompt: 'fix the bug', cwd: '/tmp', mode: 'ask',
    });
    expect(spec.executable).toBe('kilocode');
    expect(spec.args).toContain('run');
    expect(spec.args).toContain('--prompt');
    expect(spec.args).toContain('fix the bug');
    expect(spec.args).toContain('--yes');
  });

  it('classifies rate limit from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 42, 'Error: 429 rate limit exceeded')).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 5, 'Error: 401 invalid api key')).toBe('AUTH_ERROR');
  });

  it('process facts take precedence over stderr matching', () => {
    expect(classifyError(adapter, 1, 'rate limit exceeded', { timedOut: true })).toBe('TIMEOUT');
    expect(classifyError(adapter, 1, 'rate limit exceeded', { cancelled: true })).toBe('USER_CANCELLED');
  });
});

describe('codex adapter (UNVERIFIED spike)', () => {
  const adapter = new CodexAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('codex');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
  });

  it('builds a headless command with exec and --skip-git-repo-check', () => {
    const spec = adapter.buildCommand({
      id: 't1', prompt: 'fix the bug', cwd: '/tmp', mode: 'ask',
    });
    expect(spec.executable).toBe('codex');
    expect(spec.args).toContain('exec');
    expect(spec.args).toContain('--skip-git-repo-check');
    expect(spec.args).toContain('fix the bug');
  });

  it('classifies rate limit from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 42, 'Error: 429 rate limit exceeded')).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 5, 'Error: 401 invalid api key')).toBe('AUTH_ERROR');
  });

  it('process facts take precedence over stderr matching', () => {
    expect(classifyError(adapter, 1, 'rate limit exceeded', { timedOut: true })).toBe('TIMEOUT');
    expect(classifyError(adapter, 1, 'rate limit exceeded', { cancelled: true })).toBe('USER_CANCELLED');
  });
});

describe('github copilot adapter (UNVERIFIED spike)', () => {
  const adapter = new GitHubCopilotAdapter();

  it('advertises headless file-editing capabilities', () => {
    expect(adapter.id).toBe('github-copilot');
    expect(adapter.capabilities.headlessExecution).toBe(true);
    expect(adapter.capabilities.fileEditing).toBe(true);
  });

  it('builds a headless command via gh copilot --allow', () => {
    const spec = adapter.buildCommand({
      id: 't1', prompt: 'fix the bug', cwd: '/tmp', mode: 'ask',
    });
    expect(spec.executable).toBe('gh');
    expect(spec.args).toContain('copilot');
    expect(spec.args).toContain('--allow');
    expect(spec.args).toContain('fix the bug');
  });

  it('classifies rate limit from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 42, 'Error: 429 rate limit exceeded')).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', () => {
    expect(classifyError(adapter, 5, 'Error: 401 invalid api key')).toBe('AUTH_ERROR');
  });

  it('process facts take precedence over stderr matching', () => {
    expect(classifyError(adapter, 1, 'rate limit exceeded', { timedOut: true })).toBe('TIMEOUT');
    expect(classifyError(adapter, 1, 'rate limit exceeded', { cancelled: true })).toBe('USER_CANCELLED');
  });
});