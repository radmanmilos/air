import type { ModelToolDefinition } from '../../models/types';

export interface NormalizedToolContract {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolParityDifference {
  tool: string;
  path: string;
  expected: unknown;
  actual: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).sort();
}

function normalizeParameters(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (key === 'required') {
      normalized[key] = sortedStringArray(entry);
    } else if (key === 'enum') {
      normalized[key] = Array.isArray(entry) ? entry.map(normalizeSchemaValue) : [];
    } else if (key === 'properties' && isRecord(entry)) {
      const props: Record<string, unknown> = {};
      for (const propName of Object.keys(entry).sort()) {
        props[propName] = normalizeSchemaValue(entry[propName]);
      }
      normalized[key] = props;
    } else if (key === 'items') {
      normalized[key] = normalizeSchemaValue(entry);
    } else {
      normalized[key] = normalizeSchemaValue(entry);
    }
  }
  return normalized;
}

function normalizeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchemaValue);
  if (isRecord(value)) {
    // Schema/parameter objects: normalize known JSON Schema fields consistently.
    if ('properties' in value || 'required' in value || 'items' in value || 'enum' in value || 'additionalProperties' in value || 'type' in value) {
      return normalizeParameters(value);
    }
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) normalized[key] = normalizeSchemaValue(value[key]);
    return normalized;
  }
  return value;
}

export function normalizeEvalToolDefinitions(definitions: readonly ModelToolDefinition[]): NormalizedToolContract[] {
  return definitions.map((definition) => {
    const name = definition.function.name;
    const description = definition.function.description;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Evaluation tool definition missing non-empty function.name');
    }
    if (typeof description !== 'string') {
      throw new Error(`Evaluation tool definition "${name}" missing function.description`);
    }
    const normalized: NormalizedToolContract = {
      name,
      description,
      parameters: normalizeParameters(definition.function.parameters),
    };
    // Deterministic key order aligned with Python exporter (sorted keys).
    return {
      description: normalized.description,
      name: normalized.name,
      parameters: normalized.parameters,
    } as NormalizedToolContract;
  });
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function compareValues(expected: unknown, actual: unknown, tool: string, path: string, diffs: ToolParityDifference[]): void {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      diffs.push({ tool, path, expected, actual });
      return;
    }
    if (expected.length !== actual.length) {
      diffs.push({ tool, path: `${path}.length`, expected: expected.length, actual: actual.length });
    }
    const max = Math.max(expected.length, actual.length);
    for (let index = 0; index < max; index += 1) {
      compareValues(expected[index], actual[index], tool, `${path}[${index}]`, diffs);
    }
    return;
  }
  if (isRecord(expected) || isRecord(actual)) {
    if (!isRecord(expected) || !isRecord(actual)) {
      diffs.push({ tool, path, expected, actual });
      return;
    }
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) {
      if (!(key in expected)) {
        diffs.push({ tool, path: `${path}.${key}`, expected: undefined, actual: actual[key] });
        continue;
      }
      if (!(key in actual)) {
        diffs.push({ tool, path: `${path}.${key}`, expected: expected[key], actual: undefined });
        continue;
      }
      compareValues(expected[key], actual[key], tool, `${path}.${key}`, diffs);
    }
    return;
  }
  if (expected !== actual) diffs.push({ tool, path, expected, actual });
}

export function compareNormalizedRegistries(
  expected: readonly NormalizedToolContract[],
  actual: readonly NormalizedToolContract[],
): ToolParityDifference[] {
  const diffs: ToolParityDifference[] = [];
  const expectedNames = expected.map((tool) => tool.name);
  const actualNames = actual.map((tool) => tool.name);
  const expectedUnique = new Set(expectedNames);
  const actualUnique = new Set(actualNames);

  if (expectedUnique.size !== expectedNames.length) {
    diffs.push({ tool: '<registry>', path: 'tools.names.unique.expected', expected: 'unique names', actual: expectedNames });
  }
  if (actualUnique.size !== actualNames.length) {
    diffs.push({ tool: '<registry>', path: 'tools.names.unique.actual', expected: 'unique names', actual: actualNames });
  }

  const missing = expectedNames.filter((name) => !actualUnique.has(name));
  const extra = actualNames.filter((name) => !expectedUnique.has(name));
  for (const name of missing) diffs.push({ tool: name, path: 'tool', expected: 'present', actual: 'missing' });
  for (const name of extra) diffs.push({ tool: name, path: 'tool', expected: 'missing', actual: 'present' });

  const expectedByName = new Map(expected.map((tool) => [tool.name, tool]));
  const actualByName = new Map(actual.map((tool) => [tool.name, tool]));
  for (const name of [...expectedUnique].sort()) {
    if (!actualByName.has(name)) continue;
    compareValues(expectedByName.get(name), actualByName.get(name), name, name, diffs);
  }
  return diffs;
}

export function formatParityDifferences(diffs: readonly ToolParityDifference[], limit = 20): string {
  if (diffs.length === 0) return 'No tool registry parity differences.';
  const lines = diffs.slice(0, limit).map((diff) =>
    `- ${diff.tool} @ ${diff.path}\n  expected: ${json(diff.expected)}\n  actual:   ${json(diff.actual)}`,
  );
  if (diffs.length > limit) lines.push(`- ... ${diffs.length - limit} more difference(s)`);
  return lines.join('\n');
}
