// Contract tests: the TypeScript half of the shared job contract.
//
// Both this suite and packages/local-worker/tests/test_contract.py read
// contracts/job.schema.json and contracts/examples/cases.json, so the two
// validators are proven to agree on the same inputs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  CONTRACT_VERSION,
  WORKER_EXIT_CODES,
  loadSchema,
  schemaPath,
  unsupportedKeywords,
  validateRequest,
  validateResult,
  validate,
  workerExitCode,
} from '../src/contracts/job';

interface ContractCase {
  name: string;
  kind: 'request' | 'result';
  valid: boolean;
  value: unknown;
}

function examples(): ContractCase[] {
  const file = join(dirname(schemaPath()), 'examples', 'cases.json');
  return (JSON.parse(readFileSync(file, 'utf8')) as { cases: ContractCase[] }).cases;
}

describe('job contract', () => {
  it('locates the canonical schema at the AIR root', () => {
    const path = schemaPath();
    expect(path.endsWith(join('contracts', 'job.schema.json'))).toBe(true);
    expect(path).toContain('air');
  });

  it('honours AIR_CONTRACT_PATH', () => {
    const previous = process.env.AIR_CONTRACT_PATH;
    const override = join(process.cwd(), 'contracts', 'job.schema.json');
    process.env.AIR_CONTRACT_PATH = override;
    try {
      expect(schemaPath()).toBe(override);
    } finally {
      if (previous === undefined) delete process.env.AIR_CONTRACT_PATH;
      else process.env.AIR_CONTRACT_PATH = previous;
    }
  });

  it('matches the schema contract version', () => {
    expect(loadSchema()['x-contractVersion']).toBe(CONTRACT_VERSION);
  });

  it('matches the schema exit-code table', () => {
    const declared = loadSchema()['x-exitCodes'] as Record<string, string>;
    const fromSchema = Object.fromEntries(
      Object.entries(declared).map(([code, name]) => [name, Number(code)]),
    );
    expect(fromSchema).toEqual(WORKER_EXIT_CODES);
    expect(workerExitCode('COMPLETED')).toBe(0);
    expect(workerExitCode('PROVIDER_UNAVAILABLE')).toBe(5);
  });

  it('implements every keyword in the schema', () => {
    // A new keyword must be implemented here (and in air_local/contract.py)
    // before it can enter the contract.
    expect(unsupportedKeywords()).toEqual([]);
  });

  it('reports keywords it does not implement', () => {
    const schema = JSON.parse(JSON.stringify(loadSchema()));
    schema.$defs.request.properties.task.minLength = 1;
    expect(unsupportedKeywords(schema)).toEqual(['minLength']);
  });

  it('accepts a minimal request', () => {
    expect(
      validateRequest({ contractVersion: 1, runId: 'run-1', task: 'hi', cwd: '.' }),
    ).toEqual([]);
  });

  it('accepts a completed result', () => {
    expect(
      validateResult({
        contractVersion: 1,
        runId: 'run-1',
        state: 'COMPLETED',
        answer: 'done',
        steps: 2,
        toolCalls: [{ name: 'read_file', ok: true }],
        changedFiles: ['src/a.ts'],
      }),
    ).toEqual([]);
  });

  it('rejects missing required fields', () => {
    const errors = validateRequest({ contractVersion: 1, task: 'hi', cwd: '.' });
    expect(errors.join('\n')).toContain('runId');
  });

  it('rejects unknown fields', () => {
    const errors = validateRequest({
      contractVersion: 1,
      runId: 'run-1',
      task: 'hi',
      cwd: '.',
      extra: true,
    });
    expect(errors.join('\n')).toContain('extra');
  });

  it('rejects wrong types', () => {
    const errors = validateRequest({
      contractVersion: 1,
      runId: 'run-1',
      task: 'hi',
      cwd: '.',
      readOnly: 'yes',
    });
    expect(errors.join('\n')).toContain('readOnly');
  });

  it('rejects out-of-range numbers', () => {
    for (const maxSteps of [0, 201]) {
      const errors = validateRequest({
        contractVersion: 1,
        runId: 'run-1',
        task: 'hi',
        cwd: '.',
        maxSteps,
      });
      expect(errors.join('\n')).toContain('maxSteps');
    }
  });

  it('rejects unknown definitions', () => {
    expect(() => validate({}, 'nope')).toThrow(/unknown contract definition/);
  });

  it('agrees with the shared examples read by the Python suite', () => {
    const cases = examples();
    expect(cases.length).toBeGreaterThan(0);
    for (const testCase of cases) {
      const errors =
        testCase.kind === 'request'
          ? validateRequest(testCase.value)
          : validateResult(testCase.value);
      expect(errors.length === 0, `${testCase.name}: ${errors.join('; ')}`).toBe(
        testCase.valid,
      );
    }
  });
});
