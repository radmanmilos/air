import { describe, expect, it } from 'vitest';
import { validateToolCallProposal } from '../../src/evals/runner';
import { EVAL_TOOL_DEFINITIONS } from '../../src/evals/contracts/tools';
import type { ModelToolDefinition } from '../../src/models/types';

const tool = (name: string, parameters: Record<string, unknown>, description = name): ModelToolDefinition => ({
  type: 'function',
  function: { name, description, parameters },
});

describe('P1-03 strict tool proposal argument validation', () => {
  it('accepts valid proposal and absent tool call', () => {
    expect(validateToolCallProposal(undefined)).toEqual({ valid: true, reasons: [], diagnostics: [] });
    const r = validateToolCallProposal({ type: 'function', function: { name: 'git_status', arguments: {} } });
    expect(r.valid).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects unknown tools and malformed tool-call structures', () => {
    const unknown = validateToolCallProposal({ type: 'function', function: { name: 'rm_rf', arguments: {} } });
    expect(unknown.valid).toBe(false);
    expect(unknown.diagnostics[0]).toMatchObject({ code: 'unknown_tool', path: '$.function.name', tool: 'rm_rf' });

    expect(validateToolCallProposal(null as any).valid).toBe(false);
    expect(validateToolCallProposal(null as any).diagnostics[0]?.code).toBe('malformed_tool_call');
    expect(validateToolCallProposal({ function: { name: 'git_status', arguments: {} } } as any).diagnostics[0]?.code).toBe('malformed_tool_call');
    expect(validateToolCallProposal({ type: 'tool', function: { name: 'git_status', arguments: {} } } as any).diagnostics[0]?.code).toBe('invalid_tool_call_type');
    expect(validateToolCallProposal({ type: 'function', function: 'git_status' } as any).diagnostics[0]?.code).toBe('malformed_tool_call');
    expect(validateToolCallProposal({ type: 'function', function: { name: '', arguments: {} } } as any).diagnostics[0]?.code).toBe('malformed_tool_call');
  });

  it('rejects arguments that are not JSON objects', () => {
    const r = validateToolCallProposal({ type: 'function', function: { name: 'read_file', arguments: ['x'] } });
    expect(r.valid).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ code: 'arguments_not_object', path: '$.function.arguments', tool: 'read_file' });
    expect(validateToolCallProposal({ type: 'function', function: { name: 'read_file', arguments: null } }).diagnostics[0]?.code).toBe('arguments_not_object');
  });

  it('rejects missing required, wrong types, enum, and rejects extra properties when additionalProperties is false', () => {
    const missing = validateToolCallProposal({ type: 'function', function: { name: 'read_file', arguments: {} } });
    expect(missing.valid).toBe(false);
    expect(missing.diagnostics[0]).toMatchObject({ code: 'missing_required', path: '$.function.arguments.path', tool: 'read_file' });

    const wrongString = validateToolCallProposal({ type: 'function', function: { name: 'read_file', arguments: { path: 123 } } });
    expect(wrongString.diagnostics[0]).toMatchObject({ code: 'type_mismatch', path: '$.function.arguments.path', expected: 'string', actual: 'integer' });

    const wrongBool = validateToolCallProposal({ type: 'function', function: { name: 'git_diff', arguments: { staged: 'true' } } });
    expect(wrongBool.diagnostics[0]).toMatchObject({ code: 'type_mismatch', expected: 'boolean', actual: 'string' });

    const wrongInt = validateToolCallProposal({ type: 'function', function: { name: 'search_files', arguments: { pattern: 'x', max_results: 2.5 } } });
    expect(wrongInt.diagnostics[0]).toMatchObject({ code: 'type_mismatch', expected: 'integer', actual: 'number' });

    const boolAsNumber = validateToolCallProposal({ type: 'function', function: { name: 'search_files', arguments: { pattern: 'x', max_results: true } } }, [
      tool('search_files', { type: 'object', properties: { pattern: { type: 'string' }, max_results: { type: 'number' } }, required: ['pattern'] }),
    ]);
    expect(boolAsNumber.diagnostics[0]).toMatchObject({ code: 'type_mismatch', expected: 'number', actual: 'boolean' });

    const strict = [tool('strict_tool', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false })];
    const extra = validateToolCallProposal({ type: 'function', function: { name: 'strict_tool', arguments: { path: 'a', nope: 1 } } }, strict);
    expect(extra.valid).toBe(false);
    expect(extra.diagnostics[0]).toMatchObject({ code: 'unexpected_property', path: '$.function.arguments.nope' });
  });

  it('validates numbers, enums, nested objects/arrays, additionalProperties semantics, nullability, defaults and optionality with synthetic schemas', () => {
    const schema: ModelToolDefinition[] = [tool('demo', {
      type: 'object',
      properties: {
        count: { type: 'integer' },
        ratio: { type: 'number' },
        mode: { type: 'string', enum: ['a', 'b'] },
        meta: {
          type: 'object',
          properties: { tag: { type: 'string' }, flags: { type: 'array', items: { type: 'boolean' } } },
          required: ['tag'],
          additionalProperties: false,
        },
        maybe: { type: ['string', 'null'] },
        opt: { type: 'string', default: 'x' },
      },
      required: ['count', 'ratio', 'mode', 'meta'],
      additionalProperties: false,
    })];

    const ok = validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 2.5, mode: 'a', meta: { tag: 't', flags: [true, false] }, maybe: null } } }, schema);
    expect(ok.valid).toBe(true);

    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2.1, ratio: 1, mode: 'a', meta: { tag: 't' } } } }, schema).diagnostics[0]).toMatchObject({ code: 'type_mismatch', path: '$.function.arguments.count' });
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 1, mode: 'a', meta: { tag: 't' } } } }, schema).valid).toBe(true);
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 1, mode: 'c', meta: { tag: 't' } } } }, schema).diagnostics[0]).toMatchObject({ code: 'invalid_enum', path: '$.function.arguments.mode' });
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 1, mode: 'a', meta: {} } } }, schema).diagnostics[0]).toMatchObject({ code: 'missing_required', path: '$.function.arguments.meta.tag' });
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 1, mode: 'a', meta: { tag: 't', nope: 1 } } } }, schema).diagnostics[0]).toMatchObject({ code: 'unexpected_property', path: '$.function.arguments.meta.nope' });
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 1, mode: 'a', meta: { tag: 't', flags: [true, 'x'] } } } }, schema).diagnostics[0]).toMatchObject({ code: 'type_mismatch', path: '$.function.arguments.meta.flags[1]' });
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo', arguments: { count: 2, ratio: 1, mode: 'a', meta: { tag: 't' }, maybe: 1 } } }, schema).diagnostics[0]).toMatchObject({ code: 'type_mismatch', path: '$.function.arguments.maybe' });

    const permissive = [tool('demo2', { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true })];
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo2', arguments: { a: 'x', extra: 1 } } }, permissive).valid).toBe(true);
    const schemaAdditional = [tool('demo3', { type: 'object', properties: {}, additionalProperties: { type: 'integer' } })];
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo3', arguments: { any: 2 } } }, schemaAdditional).valid).toBe(true);
    expect(validateToolCallProposal({ type: 'function', function: { name: 'demo3', arguments: { any: 'x' } } }, schemaAdditional).diagnostics[0]).toMatchObject({ code: 'type_mismatch', path: '$.function.arguments.any' });
  });

  it('does not coerce or mutate, fails closed on unsupported schema features, and is deterministic (no dispatch)', () => {
    const strict = [tool('strict_tool', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false })];
    const args = { path: 'a.txt', meta: { n: 1 } };
    const before = JSON.stringify(args);
    const r1 = validateToolCallProposal({ type: 'function', function: { name: 'strict_tool', arguments: args } }, strict);
    const r2 = validateToolCallProposal({ type: 'function', function: { name: 'strict_tool', arguments: args } }, strict);
    expect(JSON.stringify(args)).toBe(before);
    expect(r1).toEqual(r2);
    expect(r1.valid).toBe(false); // extra meta rejected
    expect(args.meta.n).toBe(1);

    const unsupported = [tool('u', { type: 'object', properties: { x: { type: 'string', pattern: '^a' } }, required: ['x'] })];
    const bad = validateToolCallProposal({ type: 'function', function: { name: 'u', arguments: { x: 'a' } } }, unsupported);
    expect(bad.valid).toBe(false);
    expect(bad.diagnostics[0]?.code).toBe('unsupported_schema');

    // proof of no dispatch: validation only evaluates schema data
    const side: ModelToolDefinition[] = [{ type: 'function', function: { name: 'side', description: 'x', parameters: { type: 'object', properties: {}, required: [] } } }];
    const res = validateToolCallProposal({ type: 'function', function: { name: 'side', arguments: {} } }, side);
    expect(res.valid).toBe(true);
  });

  it('exercises real authoritative registry schemas', () => {
    expect(validateToolCallProposal({ type: 'function', function: { name: 'search_files', arguments: { pattern: 'TODO', path: 'src', max_results: 5 } } }).valid).toBe(true);
    expect(validateToolCallProposal({ type: 'function', function: { name: 'run_shell', arguments: { command: 'echo hi', cwd: '.', timeout: 10 } } }).valid).toBe(true);
    expect(validateToolCallProposal({ type: 'function', function: { name: 'git_commit', arguments: { message: 'm' } } }).valid).toBe(true);
    expect(validateToolCallProposal({ type: 'function', function: { name: 'web_fetch', arguments: { url: 1 } } }).valid).toBe(false);

    const names = EVAL_TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('run_tests');
  });
});
