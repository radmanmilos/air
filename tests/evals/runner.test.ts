import { describe, expect, it } from 'vitest';
import {
  buildEvalMessages,
  cosineSimilarity,
  parseEvalArgs,
  rankTopDocuments,
} from '../../src/evals/runner';

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
