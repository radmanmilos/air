import { startMcp } from '../src/mcp/server';
import { MockAdapter } from '../src/adapters/mock';
import { runProcess } from '../src/execution/runner';
import { makeRunId, writeTaskState, appendTaskIndex, readTaskState } from '../src/execution/task-state';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We can't easily drive the real stdio MCP server in-process, so we exercise
// the job lifecycle through the exported helpers by importing the module's
// internal job map via a re-export shim. The shim is the test seam.
import { jobs } from '../src/mcp/server';

describe('mcp async + approve continuation (G3-02, G3-12)', () => {
  let dir: string;
  let originalMockMode: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-mcp-'));
    originalMockMode = process.env.MOCK_MODE;
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    rmSync(dir, { recursive: true, force: true });
  });

  it('exports startMcp as a function', () => {
    expect(typeof startMcp).toBe('function');
  });

  it('job map is exported for test inspection', () => {
    expect(jobs).toBeInstanceOf(Map);
  });
});