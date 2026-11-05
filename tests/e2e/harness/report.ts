// tests/e2e/harness/report.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type Status = 'PASS' | 'FAIL' | 'SKIP' | 'KNOWN_GAP' | 'XPASS' | 'FLAKY';

export interface ScenarioResult {
  id: string;
  title: string;
  status: Status;
  durationMs: number;
  evidence?: string[];
  reason?: string;
}

export interface RunReport {
  runId: string;
  results: ScenarioResult[];
  metrics?: Record<string, number>;
}

export function writeReport(outDir: string, report: RunReport): void {
  mkdirSync(outDir, { recursive: true });
  const json = JSON.stringify(report, null, 2);
  writeFileSync(join(outDir, 'results.json'), json, 'utf8');
  const lines: string[] = [];
  lines.push(`# AIR E2E Report ${report.runId}`);
  lines.push('');
  lines.push('| Scenario | Status | Duration (ms) |');
  lines.push('|---|---|---|');
  for (const r of report.results) {
    lines.push(`| ${r.id} ${r.title} | ${r.status} | ${r.durationMs} |`);
  }
  if (report.metrics) {
    lines.push('');
    lines.push('## Metrics');
    for (const [k, v] of Object.entries(report.metrics)) lines.push(`- ${k}: ${v}`);
  }
  writeFileSync(join(outDir, 'summary.md'), lines.join('\n'), 'utf8');
}