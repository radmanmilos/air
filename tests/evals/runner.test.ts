import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEvalMessages,
  cosineSimilarity,
  parseEvalArgs,
  rankTopDocuments,
  runEvaluation,
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
