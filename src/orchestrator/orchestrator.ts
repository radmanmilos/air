// Central orchestrator ("brain") for AIR.
//
// Coordinates sessions, selects the best available model/tool for each task,
// persists a session log so work can be resumed/inspected, and exposes a
// single status view. CLI/MCP/sessions become thin wrappers around this.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config/paths';
import { buildModelCatalog, bestModelFor } from '../router/catalog';
import { availableAdapters } from '../adapters/registry';
import { runSession, type SessionConfig, type SessionHandle } from '../execution/sessions';
import type { TaskInput } from '../types';

export interface OrchestratorSession {
  runId: string;
  task: string;
  cwd: string;
  adapterId: string;
  provider: string;
  model: string;
  readOnly: boolean;
  state: string;
  startedAt: string;
  endedAt?: string;
  result?: string;
}

export interface OrchestratorDeps {
  adapters?: any[];
  config?: any;
}

export class Orchestrator {
  private sessions = new Map<string, OrchestratorSession>();
  private handles = new Map<string, SessionHandle>();
  private logFile: string;

  constructor(private deps: OrchestratorDeps = {}) {
    mkdirSync(paths.cacheDir, { recursive: true });
    this.logFile = join(paths.cacheDir, 'orchestrator.json');
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.logFile)) {
        const raw = JSON.parse(readFileSync(this.logFile, 'utf8'));
        for (const s of raw.sessions ?? []) this.sessions.set(s.runId, s);
      }
    } catch { /* ignore corrupt log */ }
  }

  private persist(): void {
    try {
      writeFileSync(this.logFile, JSON.stringify({ sessions: [...this.sessions.values()] }, null, 2));
    } catch { /* best-effort */ }
  }

  chooseAdapter(task: { mode: 'ask' | 'auto'; readOnly: boolean }): any | null {
    const adapters = this.deps.adapters ?? availableAdapters(this.deps.config);
    const catalog = buildModelCatalog(adapters);
    const best = bestModelFor(catalog, task);
    if (!best) return null;
    return adapters.find((a: any) => a.id === best.id) ?? null;
  }

  async start(task: string, cwd: string, options: { readOnly?: boolean; mode?: 'ask' | 'auto'; files?: string[] } = {}): Promise<OrchestratorSession> {
    const readOnly = !!options.readOnly;
    const mode = options.mode ?? 'ask';
    const adapter = this.chooseAdapter({ mode, readOnly });
    if (!adapter) throw new Error('No eligible adapter');
    const handle = await runSession({
      id: `orch-${this.sessions.size + 1}`,
      task,
      cwd,
      adapter,
      mode,
      readOnly,
      files: options.files,
      maxConcurrentAgents: this.deps.config?.concurrency?.maxConcurrentAgents ?? 1,
    });
    const session: OrchestratorSession = {
      runId: handle.runId,
      task,
      cwd,
      adapterId: adapter.id,
      provider: adapter.provider,
      model: adapter.model,
      readOnly,
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(handle.runId, session);
    this.handles.set(handle.runId, handle);
    this.persist();
    handle.promise.then(() => {
      const s = this.sessions.get(handle.runId);
      if (s) {
        s.state = handle.result === 'FAILED' ? 'FAILED' : 'COMPLETED';
        s.result = handle.result;
        s.endedAt = new Date().toISOString();
        this.persist();
      }
    }).catch(() => {});
    return session;
  }

  list(): OrchestratorSession[] {
    return [...this.sessions.values()];
  }

  get(runId: string): OrchestratorSession | undefined {
    return this.sessions.get(runId);
  }

  async cancel(runId: string): Promise<void> {
    const h = this.handles.get(runId);
    h?.cancel();
    const s = this.sessions.get(runId);
    if (s) { s.state = 'CANCELLED'; this.persist(); }
  }
}
