import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVAL_TOOL_DEFINITIONS } from '../../src/evals/contracts/tools';
import {
  compareNormalizedRegistries,
  formatParityDifferences,
  normalizeEvalToolDefinitions,
  type NormalizedToolContract,
} from '../../src/evals/contracts/tool-registry-parity';

const PYTHON_PACKAGE_ROOT = resolve(process.cwd(), 'packages', 'local-worker');
const PYTHON_EXPORT_MODULE = 'air_local.tools.export_registry';

function findPythonExecutable(): string | null {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  return null;
}

function loadPythonRegistry(): NormalizedToolContract[] {
  const python = findPythonExecutable();
  if (!python) {
    throw new Error('Python executable not found (tried python/python3/py); cannot verify worker registry parity.');
  }
  if (!existsSync(resolve(PYTHON_PACKAGE_ROOT, 'air_local', 'tools', 'export_registry.py'))) {
    throw new Error('Missing authoritative Python registry exporter: packages/local-worker/air_local/tools/export_registry.py');
  }
  const result = spawnSync(python, ['-m', PYTHON_EXPORT_MODULE], {
    cwd: PYTHON_PACKAGE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Failed to export authoritative Python tool registry via ${python} -m ${PYTHON_EXPORT_MODULE}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  const parsed = JSON.parse(result.stdout) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Python registry export must be a JSON array');
  return parsed as NormalizedToolContract[];
}

function cloneRegistry(registry: readonly NormalizedToolContract[]): NormalizedToolContract[] {
  return JSON.parse(JSON.stringify(registry)) as NormalizedToolContract[];
}

function sampleRegistry(): NormalizedToolContract[] {
  return [
    {
      name: 'read_file',
      description: 'Read file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path' },
          mode: { type: 'string', enum: ['text', 'binary'], default: 'text' },
          options: {
            type: 'object',
            additionalProperties: false,
            properties: {
              max_chars: { type: 'integer' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['max_chars'],
          },
        },
        required: ['path'],
      },
    },
  ];
}

describe('P1-03 Python/TypeScript tool registry parity', () => {
  it('matches the authoritative Python worker registry for covered contract fields', () => {
    const pythonRegistry = loadPythonRegistry();
    const evalRegistry = normalizeEvalToolDefinitions(EVAL_TOOL_DEFINITIONS);
    const diffs = compareNormalizedRegistries(pythonRegistry, evalRegistry);

    expect(pythonRegistry.length).toBeGreaterThan(0);
    expect(evalRegistry.map((t) => t.name)).toEqual(pythonRegistry.map((t) => t.name));
    expect(diffs, formatParityDifferences(diffs)).toEqual([]);
  });

  it('detects deliberate drift (missing tool, changed required field, changed nested property type, changed enum value)', () => {
    const base = sampleRegistry();

    const missingTool = cloneRegistry(base);
    missingTool.pop();
    expect(compareNormalizedRegistries(base, missingTool)).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: 'read_file', path: 'tool', expected: 'present', actual: 'missing' })]),
    );

    const changedRequired = cloneRegistry(base);
    (changedRequired[0].parameters.properties as Record<string, { required?: string[] }>).options.required = ['tags'];
    expect(compareNormalizedRegistries(base, changedRequired)).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: 'read_file', path: 'read_file.parameters.properties.options.required[0]' })]),
    );

    const changedNestedType = cloneRegistry(base);
    ((changedNestedType[0].parameters.properties as Record<string, { properties?: Record<string, { type?: string }> }>).options.properties as Record<string, { type: string }>).max_chars.type = 'string';
    expect(compareNormalizedRegistries(base, changedNestedType)).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: 'read_file', path: 'read_file.parameters.properties.options.properties.max_chars.type', expected: 'integer', actual: 'string' })]),
    );

    const changedEnum = cloneRegistry(base);
    (changedEnum[0].parameters.properties as Record<string, { enum?: string[] }>).mode.enum = ['text'];
    expect(compareNormalizedRegistries(base, changedEnum)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'read_file', path: 'read_file.parameters.properties.mode.enum.length', expected: 2, actual: 1 }),
      ]),
    );

    const diagnostics = formatParityDifferences(compareNormalizedRegistries(base, changedEnum));
    expect(diagnostics).toContain('read_file @ read_file.parameters.properties.mode.enum.length');
    expect(diagnostics).toContain('expected: 2');
    expect(diagnostics).toContain('actual:   1');
  });
});
