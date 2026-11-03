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

export interface OrchestratorEvent {
  ts: string;
  type: string;
  detail: string;
}

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
  parentRunId?: string;
}

export interface OrchestratorDeps {
  adapters?: any[];
  config?: any;
  cacheDir?: string;
}

export class Orchestrator {
  private sessions = new Map<string, OrchestratorSession>();
  private handles = new Map<string, SessionHandle>();
  private events: OrchestratorEvent[] = [];
  private logFile: string;

  constructor(private deps: OrchestratorDeps = {}) {
    const cacheDir = deps.cacheDir ?? paths.cacheDir;
    mkdirSync(cacheDir, { recursive: true });
    this.logFile = join(cacheDir, 'orchestrator.json');
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.logFile)) {
        const raw = JSON.parse(readFileSync(this.logFile, 'utf8'));
        for (const s of raw.sessions ?? []) this.sessions.set(s.runId, s);
        this.events = raw.events ?? [];
      }
    } catch { /* ignore corrupt log */ }
  }

  private persist(): void {
    try {
      writeFileSync(this.logFile, JSON.stringify({ sessions: [...this.sessions.values()], events: this.events }, null, 2));
    } catch { /* best-effort */ }
  }

  private log(type: string, detail: string): void {
    this.events.push({ ts: new Date().toISOString(), type, detail });
    this.persist();
  }

  get eventsLog(): OrchestratorEvent[] {
    return [...this.events];
  }

  chooseAdapter(task: { mode: 'ask' | 'auto'; readOnly: boolean }): any | null {
    const adapters = this.deps.adapters ?? availableAdapters(this.deps.config);
    const catalog = buildModelCatalog(adapters);
    const best = bestModelFor(catalog, task);
    if (!best) return null;
    const adapter = adapters.find((a: any) => a.id === best.id) ?? null;
    this.log('model_selected', `${best.id} (${best.provider}/${best.model}) for mode=${task.mode} readOnly=${task.readOnly}`);
    return adapter;
  }

  async start(task: string, cwd: string, options: { readOnly?: boolean; mode?: 'ask' | 'auto'; files?: string[] } = {}): Promise<OrchestratorSession> {
    const readOnly = !!options.readOnly;
    const mode = options.mode ?? 'ask';
    this.log('request_received', task);
    const adapter = this.chooseAdapter({ mode, readOnly });
    if (!adapter) {
      this.log('no_adapter', task);
      throw new Error('No eligible adapter');
    }
    this.log('session_starting', `${adapter.id} for: ${task}`);
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
    this.log('session_started', `${handle.runId} via ${adapter.id}`);
    handle.promise.then(() => {
      const s = this.sessions.get(handle.runId);
      if (s) {
        s.state = handle.result === 'FAILED' ? 'FAILED' : 'COMPLETED';
        s.result = handle.result;
        s.endedAt = new Date().toISOString();
        this.persist();
        this.log('session_completed', `${handle.runId} result=${handle.result ?? 'unknown'}`);
      }
    }).catch((err) => {
      this.log('session_error', `${handle.runId}: ${String(err)}`);
    });
    return session;
  }

  list(): OrchestratorSession[] {
    return [...this.sessions.values()];
  }

  get(runId: string): OrchestratorSession | undefined {
    return this.sessions.get(runId);
  }

  async resume(runId: string, taskOverride?: string): Promise<OrchestratorSession> {
    const prev = this.sessions.get(runId);
    if (!prev) throw new Error(`Unknown session: ${runId}`);
    const task = taskOverride ?? prev.task;
    const handoff = `Continue from previous session ${runId} (${prev.result ?? prev.state}).`;
    this.log('resume_requested', `${runId} -> ${task}`);
    const session = await this.start(`${task}\n\n--- handoff ---\n${handoff}`, prev.cwd, { readOnly: prev.readOnly, mode: 'ask' });
    session.parentRunId = runId;
    this.sessions.set(session.runId, session);
    this.persist();
    return session;
  }

  async waitForAll(): Promise<void> {
    await Promise.all([...this.handles.values()].map((h) => h.promise));
  }

  async cancel(runId: string): Promise<void> {
    const h = this.handles.get(runId);
    h?.cancel();
    const s = this.sessions.get(runId);
    if (s) { s.state = 'CANCELLED'; this.persist(); }
  }
}
