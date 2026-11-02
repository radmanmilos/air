// Zod config schema — single source of truth for air configuration.
//
// Config is versioned. `air config migrate` upgrades older versions.
// Repo `.airrc.yaml` is validated against this same schema and rejects
// unknown top-level keys by default.

import { z } from 'zod';

export const CONFIG_VERSION = 1;

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

// zod 4 does not re-run inner defaults when an object field's `.default({})`
// is an empty object, so each sub-schema default is spelled out explicitly.
const DEFAULT_FAILOVER = { mode: 'ask' as const, maxHops: 3, cooldownMinutes: 60, allowProviderSwitch: false };
const DEFAULT_PERMISSION = { mode: 'ask' as const, broadApproval: false, autoCommit: false, allowShell: false };
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
  version: z.number().int().min(1).default(CONFIG_VERSION),
  tools: z.array(ToolConfigSchema).default([]),
  failover: FailoverSchema.default(DEFAULT_FAILOVER),
  permission: PermissionSchema.default(DEFAULT_PERMISSION),
  verify: VerifySchema.default(DEFAULT_VERIFY),
  redaction: RedactionSchema.default(DEFAULT_REDACTION),
  concurrency: ConcurrencySchema.default(DEFAULT_CONCURRENCY),
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