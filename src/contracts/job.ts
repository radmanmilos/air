// The AIR job contract, read from the canonical schema in this repo.
//
// There is exactly one contract file: `contracts/job.schema.json` at the AIR
// root. The Python worker (`air_local/contract.py`) and this module both read
// it; neither keeps a copy. Validation uses the same small, deliberately
// limited JSON Schema subset on both sides so a payload accepted by one is
// accepted by the other.
//
// If the schema grows a keyword this validator does not implement,
// `unsupportedKeywords()` reports it and the contract tests fail instead of
// silently skipping the check.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CONTRACT_VERSION = 1 as const;

/** Exit codes the worker process returns. These are contract, not CLI, codes. */
export const WORKER_EXIT_CODES = {
  COMPLETED: 0,
  INVALID_REQUEST: 2,
  WORKER_FAILED: 3,
  CANCELLED: 4,
  PROVIDER_UNAVAILABLE: 5,
} as const;

export type WorkerExitName = keyof typeof WORKER_EXIT_CODES;
export type WorkerExitCode = (typeof WORKER_EXIT_CODES)[WorkerExitName];

export type JobErrorCategory =
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'WORKER_FAILED'
  | 'CANCELLED'
  | 'INTERNAL';

export type JobState = 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface JobRequest {
  contractVersion: typeof CONTRACT_VERSION;
  runId: string;
  task: string;
  cwd: string;
  readOnly?: boolean;
  allowShell?: boolean;
  allowNetwork?: boolean;
  model?: string;
  maxSteps?: number;
  configPath?: string;
}

export interface JobToolCall {
  name: string;
  ok: boolean;
}

export interface JobResult {
  contractVersion: typeof CONTRACT_VERSION;
  runId: string;
  state: JobState;
  answer?: string;
  error?: { category: JobErrorCategory; message: string };
  startedAt?: string;
  endedAt?: string;
  steps?: number;
  toolCalls?: JobToolCall[];
  changedFiles?: string[];
}

/** Map a worker outcome to its process exit code. */
export function workerExitCode(name: WorkerExitName): WorkerExitCode {
  return WORKER_EXIT_CODES[name];
}

const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  '$defs',
  '$ref',
  'oneOf',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'minimum',
  'maximum',
  'items',
  'x-contractVersion',
  'x-exitCodes',
]);

type JsonSchema = Record<string, unknown>;

/**
 * Locate the canonical contract file.
 *
 * `AIR_CONTRACT_PATH` wins; otherwise walk up from this module until
 * `contracts/job.schema.json` is found. That works from source
 * (`src/contracts`), from the build (`dist/src/contracts`), and from the npm
 * layout (`node_modules/air/dist/src/contracts`).
 */
export function schemaPath(): string {
  const override = process.env.AIR_CONTRACT_PATH;
  if (override) return resolve(override);
  let dir = __dirname;
  for (;;) {
    const candidate = join(dir, 'contracts', 'job.schema.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'contracts/job.schema.json not found; set AIR_CONTRACT_PATH to the AIR contract file',
  );
}

export function loadSchema(path?: string): JsonSchema {
  return JSON.parse(readFileSync(path ?? schemaPath(), 'utf8')) as JsonSchema;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeOk(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  const prefix = '#/$defs/';
  if (!ref.startsWith(prefix)) {
    throw new Error(`unsupported $ref (only #/$defs/* is supported): ${ref}`);
  }
  const name = ref.slice(prefix.length);
  const defs = isObject(root.$defs) ? root.$defs : {};
  const target = defs[name];
  if (!isObject(target)) {
    throw new Error(`$ref points at unknown definition: ${name}`);
  }
  return target;
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: string[],
): void {
  if (typeof schema.$ref === 'string') {
    validateNode(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  if (Array.isArray(schema.oneOf)) {
    let passing = 0;
    for (const branch of schema.oneOf) {
      if (!isObject(branch)) continue;
      const branchErrors: string[] = [];
      validateNode(value, branch, root, path, branchErrors);
      if (branchErrors.length === 0) passing += 1;
    }
    if (passing !== 1) {
      errors.push(`${path}: must match exactly one variant (matched ${passing})`);
    }
    return;
  }

  const expected = schema.type;
  if (expected !== undefined) {
    const types = Array.isArray(expected) ? expected : [expected];
    if (!types.some((t) => typeOk(value, String(t)))) {
      errors.push(`${path}: expected ${types.join('/')}, got ${describe(value)}`);
      return;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }

  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${path}: must be >= ${schema.minimum}`);
  }
  if (typeof value === 'number' && typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push(`${path}: must be <= ${schema.maximum}`);
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!(String(key) in value)) {
        errors.push(`${path}: missing required field '${String(key)}'`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}: unexpected field '${key}'`);
      }
    }
    for (const [key, sub] of Object.entries(properties)) {
      if (key in value && isObject(sub)) {
        validateNode(value[key], sub, root, `${path}.${key}`, errors);
      }
    }
  }

  if (Array.isArray(value) && isObject(schema.items)) {
    value.forEach((item, index) => {
      validateNode(item, schema.items as JsonSchema, root, `${path}[${index}]`, errors);
    });
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Validate against `#/$defs/<definition>`. Returns error strings. */
export function validate(
  value: unknown,
  definition: string,
  schema?: JsonSchema,
): string[] {
  const root = schema ?? loadSchema();
  const defs = isObject(root.$defs) ? root.$defs : {};
  const target = defs[definition];
  if (!isObject(target)) {
    throw new Error(`unknown contract definition: ${definition}`);
  }
  const errors: string[] = [];
  validateNode(value, target, root, '$', errors);
  return errors;
}

export function validateRequest(value: unknown, schema?: JsonSchema): string[] {
  return validate(value, 'request', schema);
}

export function validateResult(value: unknown, schema?: JsonSchema): string[] {
  return validate(value, 'result', schema);
}

/** Schema keywords this validator does not implement. Must stay empty. */
export function unsupportedKeywords(schema?: JsonSchema): string[] {
  const root = schema ?? loadSchema();
  const unknown = new Set<string>();

  const walk = (node: JsonSchema): void => {
    for (const key of Object.keys(node)) {
      if (!SUPPORTED_KEYWORDS.has(key)) unknown.add(key);
    }
    if (isObject(node.properties)) {
      for (const sub of Object.values(node.properties)) {
        if (isObject(sub)) walk(sub);
      }
    }
    if (isObject(node.items)) walk(node.items);
    if (isObject(node.$defs)) {
      for (const sub of Object.values(node.$defs)) {
        if (isObject(sub)) walk(sub);
      }
    }
    if (Array.isArray(node.oneOf)) {
      for (const sub of node.oneOf) {
        if (isObject(sub)) walk(sub);
      }
    }
  };

  walk(root);
  return [...unknown].sort();
}
