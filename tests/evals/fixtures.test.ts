import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface FixtureCase {
  id: string;
  oracle?: string;
  workspace?: string;
  evidence?: Record<string, unknown>;
  falsePositiveControl?: boolean;
  expectedFinding?: { severity: string } | null;
  messages?: unknown[];
  required?: string[];
  forbidden?: string[];
  expectedRelevantDocIds?: string[];
}

interface FixtureDocument {
  id: string;
  title: string;
  text: string;
  status?: string;
}

interface FixtureCatalog {
  cases: FixtureCase[];
  corpus?: FixtureDocument[];
  queries?: FixtureCase[];
}

const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function loadCatalog(name: string): Promise<FixtureCatalog> {
  const raw = await readFile(resolve(FIXTURE_ROOT, name), 'utf8');
  return JSON.parse(raw) as FixtureCatalog;
}

function expectUniqueIds(items: Array<{ id: string }>): void {
  const ids = items.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('local-first evaluation fixture payloads', () => {
  it('preserves the versioned suite sizes and unique stable IDs', async () => {
    const expected: Record<string, number> = {
      'coordinator.json': 20,
      'planner.json': 12,
      'tool-calling.json': 12,
      'coder.json': 8,
      'debugging.json': 8,
      'reviewer.json': 10,
      'summarizer.json': 8,
    };
    for (const [name, count] of Object.entries(expected)) {
      const catalog = await loadCatalog(name);
      expect(catalog.cases).toHaveLength(count);
      expectUniqueIds(catalog.cases);
    }
  });

  it('points coder tasks at the workspace helper fixture', async () => {
    const catalog = await loadCatalog('coder.json');
    expect(catalog.cases.every((item) => item.workspace === 'coder-discount')).toBe(true);
    const workspace = await readFile(
      resolve(FIXTURE_ROOT, 'payloads/workspaces/coder-discount/README.md'),
      'utf8',
    );
    expect(workspace).toContain('deliberately');
  });

  it('provides concrete diagnostic evidence for every debugging case', async () => {
    const catalog = await loadCatalog('debugging.json');
    expect(catalog.cases).toHaveLength(8);
    for (const item of catalog.cases) {
      expect(item.evidence).toBeDefined();
      expect(Object.keys(item.evidence ?? {}).length).toBeGreaterThan(0);
      expect(item.oracle).toBeTruthy();
    }
  });

  it('contains seeded reviewer defects and explicit clean controls', async () => {
    const catalog = await loadCatalog('reviewer.json');
    const controls = catalog.cases.filter((item) => item.falsePositiveControl === true);
    expect(controls).toHaveLength(2);
    expect(controls.every((item) => item.expectedFinding === null)).toBe(true);
    expect(catalog.cases.filter((item) => item.expectedFinding !== null)).toHaveLength(8);
  });

  it('preserves summarizer requirements and redaction canaries', async () => {
    const catalog = await loadCatalog('summarizer.json');
    expect(catalog.cases).toHaveLength(8);
    for (const item of catalog.cases) {
      expect(item.messages?.length).toBeGreaterThan(0);
      expect(item.required?.length).toBeGreaterThan(0);
    }
    const secretCase = catalog.cases.find((item) => item.id === 'S04');
    expect(secretCase?.forbidden).toContain('sk-air-eval-not-a-real-secret-000000000000');
  });

  it('labels every embeddings query against a known corpus and includes negative controls', async () => {
    const catalog = await loadCatalog('embeddings.json');
    const corpus = catalog.corpus ?? [];
    const queries = catalog.queries ?? [];
    expect(corpus).toHaveLength(15);
    expect(queries).toHaveLength(10);
    expectUniqueIds(corpus);
    expectUniqueIds(queries);

    const corpusIds = new Set(corpus.map((item) => item.id));
    for (const query of queries) {
      for (const expectedId of query.expectedRelevantDocIds ?? []) {
        expect(corpusIds.has(expectedId)).toBe(true);
      }
    }
    expect(queries.find((item) => item.id === 'E09')?.expectedRelevantDocIds).toEqual([]);
    expect(corpus.find((item) => item.id === 'C13')?.status).toBe('superseded');
  });
});
