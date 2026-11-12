// Zod config schema — single source of truth for air configuration.
//
// Config is versioned. `air config migrate` upgrades older versions.
// Repo `.airrc.yaml` is validated against this same schema and rejects
// unknown top-level keys by default.

import { z } from 'zod';

export const CONFIG_VERSION = 2;

export const MODEL_ROLES = [
  'coordinator',
  'planner',
  'coder',
  'reviewer',
  'reasoner',
  'summarizer',
  'embeddings',
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

const RoleAssignmentSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const ProviderSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().url().optional(),
});

const DEFAULT_MODEL_ROLES = {
  coordinator: { provider: 'ollama', model: 'qwen3.5:4b' },
  planner: { provider: 'ollama', model: 'qwen3.5:4b' },
  coder: { provider: 'ollama', model: 'qwen2.5-coder:7b' },
  reviewer: { provider: 'ollama', model: 'qwen3.5:4b' },
  reasoner: { provider: 'ollama', model: 'deepseek-r1:1.5b' },
  summarizer: { provider: 'ollama', model: 'qwen3.5:4b' },
  embeddings: { provider: 'ollama', model: 'nomic-embed-text:latest' },
};

const DEFAULT_MODEL_PROVIDERS = {
  ollama: { enabled: true, baseUrl: 'http://127.0.0.1:11434' },
};

const ModelsSchema = z.object({
  localFirst: z.boolean().default(true),
  maxConcurrentGenerative: z.number().int().min(1).max(8).default(1),
  keepAlive: z.string().min(1).default('5m'),
  providers: z.record(z.string(), ProviderSettingsSchema).default(DEFAULT_MODEL_PROVIDERS),
  roles: z.object({
    coordinator: RoleAssignmentSchema,
    planner: RoleAssignmentSchema,
    coder: RoleAssignmentSchema,
    reviewer: RoleAssignmentSchema,
    reasoner: RoleAssignmentSchema,
    summarizer: RoleAssignmentSchema,
    embeddings: RoleAssignmentSchema,
  }).default(DEFAULT_MODEL_ROLES),
});

const DEFAULT_MODELS = {
  localFirst: true,
  maxConcurrentGenerative: 1,
  keepAlive: '5m',
  providers: DEFAULT_MODEL_PROVIDERS,
  roles: DEFAULT_MODEL_ROLES,
};

const ToolConfigSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  executable: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

const FailoverSchema = z.object({
  mode: z.enum(['ask', 'auto']).default('ask'),
  maxHops: z.number().int().min(1).max(10).default(3),
  cooldownMinutes: z.number().int().min(0).default(60),
  allowProviderSwitch: z.boolean().default(false),
});

/** Permission mode is separate from failover mode (R5-13). */
const PermissionSchema = z.object({
  mode: z.enum(['ask', 'auto', 'deny']).default('ask'),
  broadApproval: z.boolean().default(false),
  autoCommit: z.boolean().default(false),
  allowShell: z.boolean().default(false),
  allowedPaths: z.array(z.string()).optional(),
  allowNetwork: z.boolean().default(false),
  allowInstall: z.boolean().default(false),
});

const VerifySchema = z.object({
  enabled: z.boolean().default(false),
  command: z.string().optional(),
});

const TrustedReposSchema = z.array(z.string()).default([]);

const RedactionSchema = z.object({
  enabled: z.boolean().default(true),
});

const ConcurrencySchema = z.object({
  maxConcurrentAgents: z.number().int().min(1).default(1),
});

const CostOverridesSchema = z.record(z.string(), z.number().int().min(0).max(3)).default({});

// Catalog of installable free AI tools (Phase 1).
const CatalogSchema = z.object({
  remoteUrl: z.string().url().optional(),
  autoInstall: z.boolean().default(false),
  proxy: z.string().optional(),
});
const DEFAULT_CATALOG = { remoteUrl: undefined as string | undefined, autoInstall: false, proxy: undefined as string | undefined };

// zod 4 does not re-run inner defaults when an object field's `.default({})`
// is an empty object, so each sub-schema default is spelled out explicitly.
const DEFAULT_FAILOVER = { mode: 'ask' as const, maxHops: 3, cooldownMinutes: 60, allowProviderSwitch: false };
const DEFAULT_PERMISSION = { mode: 'ask' as const, broadApproval: false, autoCommit: false, allowShell: false, allowNetwork: false, allowInstall: false };
const DEFAULT_VERIFY = { enabled: false };
const DEFAULT_REDACTION = { enabled: true };
const DEFAULT_CONCURRENCY = { maxConcurrentAgents: 1 };
const DEFAULT_TIMEOUTS = { defaultMs: 300_000, perTool: {} };
const DEFAULT_BUFFERS = { maxBytes: 1_000_000 };
const DEFAULT_LOGGING = {
  level: 'info' as const,
  redact: true,
  rotation: { maxBytes: 10 * 1024 * 1024, maxBackups: 5 },
};

export const ConfigSchema = z.object({
  version: z.number().int().min(1).max(CONFIG_VERSION).default(CONFIG_VERSION),
  tools: z.array(ToolConfigSchema).default([]),
  failover: FailoverSchema.default(DEFAULT_FAILOVER),
  permission: PermissionSchema.default(DEFAULT_PERMISSION),
  verify: VerifySchema.default(DEFAULT_VERIFY),
  redaction: RedactionSchema.default(DEFAULT_REDACTION),
  concurrency: ConcurrencySchema.default(DEFAULT_CONCURRENCY),
  catalog: CatalogSchema.default(DEFAULT_CATALOG),
  costOverrides: CostOverridesSchema.default({}),
  trustedRepos: TrustedReposSchema.default([]),
  timeouts: z
    .object({
      defaultMs: z.number().int().min(1000).default(300_000),
      perTool: z.record(z.string(), z.number().int().min(1000)).default({}),
    })
    .default(DEFAULT_TIMEOUTS),
  buffers: z
    .object({
      maxBytes: z.number().int().min(1024).default(1_000_000),
    })
    .default(DEFAULT_BUFFERS),
  models: ModelsSchema.default(DEFAULT_MODELS),
  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      redact: z.boolean().default(true),
      rotation: z
        .object({
          maxBytes: z.number().int().min(1024).default(10 * 1024 * 1024),
          maxBackups: z.number().int().min(0).default(5),
        })
        .default(DEFAULT_LOGGING.rotation),
    })
    .default(DEFAULT_LOGGING),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export type ModelsConfig = z.infer<typeof ModelsSchema>;
export type ModelRoleConfig = z.infer<typeof RoleAssignmentSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({ version: CONFIG_VERSION });

/** Strict variant that rejects unknown top-level keys (used for repo config). */
export const StrictConfigSchema = ConfigSchema.strict();

export function parseConfig(input: unknown, options: { strict?: boolean } = {}): Config {
  const schema = options.strict ? StrictConfigSchema : ConfigSchema;
  return schema.parse(input);
}

export function safeParseConfig(input: unknown, options: { strict?: boolean } = {}): { success: true; data: Config } | { success: false; error: z.ZodError } {
  const schema = options.strict ? StrictConfigSchema : ConfigSchema;
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

/** Format a Zod error into a message naming file and key. */
export function formatConfigError(error: z.ZodError, file: string): string {
  const lines = error.issues.map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)';
    return `  - ${file}: ${path}: ${i.message}`;
  });
  return ['Config validation failed:', ...lines].join('\n');
}