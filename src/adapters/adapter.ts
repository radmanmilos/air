// Adapter contract. Every tool adapter (aider, goose, ...) must implement
// this interface. The router core depends only on it, so new adapters can be
// added without changing router logic.

import type { ErrorCategory } from '../types/errors';
import type { CommandSpec, ParsedEvent, TaskInput } from '../types';

export interface AgentAdapter {
  /** Stable id, e.g. 'aider'. */
  id: string;

  /** Provider this adapter is configured to use, e.g. 'openrouter'. */
  provider: string;

  /** Model this adapter is configured to use. */
  model: string;

  /** Executable to spawn (configurable). */
  executable?: string;

  /** Capabilities advertised by this adapter. */
  capabilities: {
    headlessExecution: boolean;
    structuredOutput: boolean;
    fileEditing: boolean;
    shellAccess: boolean;
    imageInput: boolean;
    supportsCancellation: boolean;
    supportsStreaming: boolean;
    contextWindow?: number;
  };

  /** True if the adapter can handle this task (capability + availability check). */
  canHandle(task: TaskInput): boolean | Promise<boolean>;

  /** Build the spawn spec for this task. */
  buildCommand(task: TaskInput): CommandSpec;

  /** Parse an output chunk into structured events. */
  parseOutput(chunk: Buffer | string): ParsedEvent[];

  /**
   * Classify a failure from exit code + stderr + structured evidence.
   * Never scan model-generated stdout prose for provider errors.
   */
  classifyError(exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory;
}

/** Verification metadata carried by the registry, not the adapter contract. */
export interface AdapterMeta {
  verified: boolean;
  enabled: boolean;
  headlessSupported: boolean;
  verificationDate?: string;
  verificationVersion?: string;
}