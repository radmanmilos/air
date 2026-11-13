import { describe, expect, it } from 'vitest';
import { validateToolCallProposal } from '../../src/evals/runner';
import { EVAL_TOOL_DEFINITIONS } from '../../src/evals/contracts/tools';

describe('P1-03 tool proposal validation', () => {
  it('rejects unknown tools', () => {
    const r = validateToolCallProposal({ type: 'function', function: { name: 'rm_rf', arguments: {} } });
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toBe('unknown_tool');
  });

  it('rejects missing required arguments', () => {
    const r = validateToolCallProposal({ type: 'function', function: { name: 'read_file', arguments: {} } });
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toMatch(/missing_required_arguments/);
  });

  it('accepts valid registered tool calls', () => {
    const r = validateToolCallProposal({ type: 'function', function: { name: 'git_status', arguments: {} } });
    expect(r.valid).toBe(true);
  });

  it('registry contains expected worker tools', () => {
    const names = EVAL_TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('run_shell');
    expect(names).toContain('run_tests');
    expect(names).toContain('search_files');
  });
});
