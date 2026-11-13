import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEvalMessages,
  buildEvalChatRequest,
  cosineSimilarity,
  parseEvalArgs,
  rankTopDocuments,
  runEvaluation,
  runGenerationSuite,
  validateToolCallProposal,
  type EvalRunnerOptions,
} from '../../src/evals/runner';
import type { ModelChatRequest, ModelChatResponse, ModelDescriptor, ModelEmbeddingRequest, ModelEmbeddingResponse, ProviderHealth, RunningModelDescriptor } from '../../src/models/types';
import type { ModelProvider } from '../../src/models/providers/provider';

describe('evaluation runner argument parsing', () => {
  it('requires a suite and exact installed model tag', () => {
    expect(() => parseEvalArgs([])).toThrow('--suite');
    expect(() => parseEvalArgs(['--suite', 'coder'])).toThrow('--model');
  });

  it('parses bounded repeat/context settings and defaults', () => {
    expect(parseEvalArgs([
      '--suite', 'coder',
      '--model', 'qwen2.5-coder:7b',
      '--repetitions', '5',
      '--warmups', '0',
      '--context', '4096',
    ])).toMatchObject({
      suite: 'coder',
      model: 'qwen2.5-coder:7b',
      repetitions: 5,
      warmups: 0,
      context: 4096,
      timeoutMs: 120000,
    });
  });

  it('rejects invalid suites, numeric bounds and unknown flags', () => {
    expect(() => parseEvalArgs(['--suite', 'unknown', '--model', 'x'])).toThrow('--suite');
    expect(() => parseEvalArgs(['--suite', 'coder', '--model', 'x', '--repetitions', '0'])).toThrow('--repetitions');
    expect(() => parseEvalArgs(['--suite', 'coder', '--model', 'x', '--warmups', '-1'])).toThrow('--warmups');
    expect(() => parseEvalArgs(['--suite', 'coder', '--model', 'x', '--context', '128'])).toThrow('--context');
    expect(() => parseEvalArgs(['--suite', 'coder', '--model', 'x', '--mystery'])).toThrow('Unknown argument');
  });

  it('supports help without requiring other options', () => {
    expect(parseEvalArgs(['--help'])).toEqual({ help: true });
  });
});

describe('evaluation prompt and scoring helpers', () => {
  it('does not disclose scoring oracles in model prompts', () => {
    const messages = buildEvalMessages('reviewer', {
      id: 'R01',
      input: 'Review this synthetic diff',
      diff: 'const target = path.resolve(root, requestedPath);',
      context: 'Untrusted path input',
      oracle: 'critical_defect_detected',
      expectedFinding: { severity: 'critical' },
      falsePositiveControl: false,
    });
    const prompt = messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('Review this synthetic diff');
    expect(prompt).toContain('path.resolve');
    expect(prompt).not.toContain('critical_defect_detected');
    expect(prompt).not.toContain('"severity": "critical"');
    expect(prompt).not.toContain('falsePositiveControl');
  });

  it('includes copied workspace files for coder prompts but not expected file lists', () => {
    const messages = buildEvalMessages('coder', {
      id: 'K01',
      input: 'Fix the percentage calculation',
      oracle: 'focused_diff_and_test',
      workspace: 'coder-discount',
      expectedFiles: ['src/discount.js'],
      acceptance: ['all tests pass'],
    }, { 'src/discount.js': 'return price - price * percent;' });
    const prompt = messages[1]?.content ?? '';
    expect(prompt).toContain('src/discount.js');
    expect(prompt).toContain('return price');
    expect(prompt).toContain('all tests pass');
    expect(prompt).not.toContain('focused_diff_and_test');
    expect(prompt).not.toContain('expectedFiles');
  });

  it('calculates cosine similarity and ranks labelled documents', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow(/same non-zero dimension/);
    const ranked = rankTopDocuments(
      [1, 0],
      [
        { id: 'A', title: 'A', text: 'first' },
        { id: 'B', title: 'B', text: 'second' },
      ],
      [[0, 1], [1, 0]],
    );
    expect(ranked[0]?.id).toBe('B');
  });
});


function createMockProvider(installed = true): ModelProvider {
  return {
    id: 'ollama',
    health: vi.fn(async (): Promise<ProviderHealth> => ({
      provider: 'ollama',
      online: true,
      version: 'test-ollama',
    })),
    listModels: vi.fn(async (): Promise<ModelDescriptor[]> =>
      installed ? [{ name: 'test-model:latest', digest: 'sha-test' }] : [],
    ),
    showModel: vi.fn(async (model: string): Promise<ModelDescriptor> => ({
      name: model,
      contextLength: 4096,
      capabilities: ['chat', 'embeddings'],
    })),
    listRunningModels: vi.fn(async (): Promise<RunningModelDescriptor[]> => [{
      name: 'test-model:latest',
      sizeVramBytes: 512,
    }]),
    chat: vi.fn(async (request: ModelChatRequest): Promise<ModelChatResponse> => ({
      provider: 'ollama',
      model: request.model,
      message: { role: 'assistant', content: 'candidate output', toolCalls: [] },
    })),
    embed: vi.fn(async (request: ModelEmbeddingRequest): Promise<ModelEmbeddingResponse> => {
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      return {
        provider: 'ollama',
        model: request.model,
        embeddings: inputs.map(() => [1, 0]),
      };
    }),
  };
}

function embeddingRunOptions(output: string): EvalRunnerOptions {
  return {
    suite: 'embeddings',
    model: 'test-model:latest',
    baseUrl: 'http://127.0.0.1:11434',
    output,
    repetitions: 1,
    warmups: 0,
    context: 2048,
    promptVersion: 'test-prompt-v1',
    timeoutMs: 5000,
  };
}

describe('evaluation runner execution boundary', () => {
  it('refuses missing models without invoking generation or embedding', async () => {
    const provider = createMockProvider(false);
    await expect(runEvaluation(embeddingRunOptions(join(tmpdir(), 'unused.jsonl')), {
      provider,
    })).rejects.toThrow('this runner never pulls models');
    expect(provider.chat).not.toHaveBeenCalled();
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('writes reproducible embedding results and runtime diagnostics', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'air-eval-runner-'));
    const output = join(directory, 'results.jsonl');
    const provider = createMockProvider(true);
    try {
      const result = await runEvaluation(embeddingRunOptions(output), { provider });
      expect(result.measuredCases).toBe(10);
      expect(result.modelDigest).toBe('sha-test');

      const records = (await readFile(output, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records[0]).toMatchObject({
        recordType: 'run',
        modelDigest: 'sha-test',
        ollamaVersion: 'test-ollama',
        promptVersion: 'test-prompt-v1',
        modelContextLength: 4096,
      });
      expect(records.filter((record) => record.recordType === 'query')).toHaveLength(10);
      expect(records.find((record) => record.recordType === 'runtime')).toMatchObject({
        runningModelStatus: 'available',
        runningModels: [{ name: 'test-model:latest', sizeVramBytes: 512 }],
      });
      expect(records.find((record) => record.queryId === 'E09')).toMatchObject({
        expectedNoMatch: true,
        recallAt5: null,
        reciprocalRank: null,
      });
      expect(provider.embed).toHaveBeenCalledTimes(2);
      expect(provider.chat).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});


describe('P1-03 evaluation request integrity', () => {
  it('supplies ActionSchema format for coordinator requests', () => {
    const msgs = buildEvalMessages('coordinator', { id: 'C01', input: 'Explain promises', expectedAction: 'answer' });
    const req = buildEvalChatRequest('coordinator', 'm', msgs, 8192, 1000);
    expect(req.format).toBeDefined();
    expect(JSON.stringify(req.format)).toContain('"answer"');
    expect(JSON.stringify(msgs)).not.toContain('"expectedAction"');
  });

  it('supplies PlanSchema format for planner requests', () => {
    const msgs = buildEvalMessages('planner', { id: 'P01', input: 'Plan x', oracle: ['x'] });
    const req = buildEvalChatRequest('planner', 'm', msgs, 8192, 1000);
    expect(req.format).toBeDefined();
    expect(JSON.stringify(req.format)).toContain('workItems');
    expect(JSON.stringify(msgs)).not.toContain('"oracle"');
  });

  it('supplies actual tool definitions for tool-calling requests and hides expected tool', () => {
    const msgs = buildEvalMessages('tool-calling', { id: 'T01', input: 'Read src/index.ts', expectedTool: 'read_file', policyOracle: 'allow' });
    const req = buildEvalChatRequest('tool-calling', 'm', msgs, 8192, 1000);
    expect(Array.isArray(req.tools)).toBe(true);
    expect(req.tools?.some((t) => t.function.name === 'read_file')).toBe(true);
    const prompt = msgs.map((m) => m.content).join('\n');
    expect(prompt).toContain('read_file');
    expect(prompt).not.toContain('expectedTool');
    expect(prompt).not.toContain('policyOracle');
  });

  it('does not leak reviewer oracle labels in real fixture prompts', async () => {
    const raw = await readFile(join(process.cwd(), 'tests', 'evals', 'fixtures', 'reviewer.json'), 'utf8');
    const catalog = JSON.parse(raw) as { cases: Array<{ id: string; input: string; expectedFinding?: unknown }> };
    for (const fixture of catalog.cases) {
      const msgs = buildEvalMessages('reviewer', fixture as any);
      const prompt = msgs.map((m) => m.content).join('\n');
      expect(prompt).not.toMatch(/Seeded critical|Seeded high|Seeded medium|Clean control/i);
      expect(prompt).not.toContain('expectedFinding');
      expect(prompt).not.toContain('falsePositiveControl');
      expect(prompt).not.toContain('"oracle"');
    }
  });
});

describe('P1-06 planner validate cases (runner-level)', () => {
  function plannerRunOptions(output: string): EvalRunnerOptions {
    return {
      suite: 'planner',
      model: 'test-model:latest',
      baseUrl: 'http://127.0.0.1:11434',
      output,
      repetitions: 1,
      warmups: 0,
      context: 2048,
      promptVersion: 'test-prompt-v1',
      timeoutMs: 5000,
    };
  }

  it('runs validate cases via deterministic validation without provider.chat and records expected metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'air-eval-planner-validate-'));
    const output = join(directory, 'results.jsonl');
    const chat = vi.fn(() => {
      throw new Error('provider.chat must not be called for planner mode:validate cases');
    });
    const provider = {
      ...createMockProvider(true),
      chat,
      embed: vi.fn(() => {
        throw new Error('provider.embed must not be called for planner cases');
      }),
    } as unknown as ModelProvider;
    const catalog = {
      cases: [
        {
          id: 'PV01',
          input: 'Validate a correct bounded plan',
          mode: 'validate' as const,
          plan: {
            workItems: [
              {
                id: 'w1',
                objective: 'Inspect parser module',
                taskType: 'research',
                readOnly: true,
                requiresWrite: false,
                requiresCode: false,
                dependsOn: [],
                acceptanceCriteria: ['Relevant parser behavior is identified'],
              },
            ],
          },
        },
        {
          id: 'PV02',
          input: 'Validate an invalid plan with self-dependency',
          mode: 'validate' as const,
          plan: {
            workItems: [
              {
                id: 'w1',
                objective: 'Broken plan item',
                taskType: 'plan',
                readOnly: true,
                requiresWrite: false,
                requiresCode: false,
                dependsOn: ['w1'],
                acceptanceCriteria: ['ok'],
              },
            ],
          },
        },
      ],
    };
    try {
      const measured = await runGenerationSuite(plannerRunOptions(output), catalog, provider, output, {});
      expect(measured).toBe(2);
      expect(chat).not.toHaveBeenCalled();

      const records = (await readFile(output, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records).toHaveLength(2);

      const valid = records.find((r) => r.caseId === 'PV01');
      expect(valid).toMatchObject({
        recordType: 'case',
        suite: 'planner',
        caseId: 'PV01',
        phase: 'measured',
        repetition: 1,
        promptVersion: 'test-prompt-v1',
        contextTokens: 2048,
        provider: 'ollama',
        model: 'test-model:latest',
        durationMs: 0,
        output: null,
        toolCalls: [],
        finishReason: null,
        usage: null,
        tokensPerSecond: null,
        timing: null,
        deterministicValidation: { mode: 'validate', valid: true, errors: [] },
        safetyOracles: { executed: false, reason: 'planner-validator-case-no-model-call' },
        requestContract: {
          schemaName: 'PlanSchema',
          formatProvided: true,
          toolsProvided: false,
        },
      });
      expect((valid?.requestContract as { schemaHash?: unknown } | undefined)?.schemaHash).toEqual(expect.any(String));
      expect(typeof valid?.rssBeforeBytes).toBe('number');
      expect(typeof valid?.rssAfterBytes).toBe('number');

      const invalid = records.find((r) => r.caseId === 'PV02');
      expect(invalid).toMatchObject({
        recordType: 'case',
        suite: 'planner',
        caseId: 'PV02',
        deterministicValidation: { mode: 'validate', valid: false },
        safetyOracles: { executed: false, reason: 'planner-validator-case-no-model-call' },
      });
      const errors = (invalid?.deterministicValidation as { errors?: unknown[] } | undefined)?.errors ?? [];
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBeGreaterThan(0);
      expect(JSON.stringify(errors)).toContain('self-dependency');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
