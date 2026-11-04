import { z } from 'zod';
export declare const CONFIG_VERSION = 1;
declare const ToolConfigSchema: z.ZodObject<{
    id: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    executable: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ConfigSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodNumber>;
    tools: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        enabled: z.ZodDefault<z.ZodBoolean>;
        executable: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    failover: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            ask: "ask";
            auto: "auto";
        }>>;
        maxHops: z.ZodDefault<z.ZodNumber>;
        cooldownMinutes: z.ZodDefault<z.ZodNumber>;
        allowProviderSwitch: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    permission: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            ask: "ask";
            auto: "auto";
            deny: "deny";
        }>>;
        broadApproval: z.ZodDefault<z.ZodBoolean>;
        autoCommit: z.ZodDefault<z.ZodBoolean>;
        allowShell: z.ZodDefault<z.ZodBoolean>;
        allowedPaths: z.ZodOptional<z.ZodArray<z.ZodString>>;
        allowNetwork: z.ZodDefault<z.ZodBoolean>;
        allowInstall: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    verify: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        command: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    redaction: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    concurrency: z.ZodDefault<z.ZodObject<{
        maxConcurrentAgents: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    catalog: z.ZodDefault<z.ZodObject<{
        remoteUrl: z.ZodOptional<z.ZodString>;
        autoInstall: z.ZodDefault<z.ZodBoolean>;
        proxy: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    costOverrides: z.ZodDefault<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
    trustedRepos: z.ZodDefault<z.ZodDefault<z.ZodArray<z.ZodString>>>;
    timeouts: z.ZodDefault<z.ZodObject<{
        defaultMs: z.ZodDefault<z.ZodNumber>;
        perTool: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, z.core.$strip>>;
    buffers: z.ZodDefault<z.ZodObject<{
        maxBytes: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    logging: z.ZodDefault<z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<{
            error: "error";
            info: "info";
            debug: "debug";
            warn: "warn";
        }>>;
        redact: z.ZodDefault<z.ZodBoolean>;
        rotation: z.ZodDefault<z.ZodObject<{
            maxBytes: z.ZodDefault<z.ZodNumber>;
            maxBackups: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Config = z.infer<typeof ConfigSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export declare const DEFAULT_CONFIG: Config;
/** Strict variant that rejects unknown top-level keys (used for repo config). */
export declare const StrictConfigSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodNumber>;
    tools: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        enabled: z.ZodDefault<z.ZodBoolean>;
        executable: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    failover: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            ask: "ask";
            auto: "auto";
        }>>;
        maxHops: z.ZodDefault<z.ZodNumber>;
        cooldownMinutes: z.ZodDefault<z.ZodNumber>;
        allowProviderSwitch: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    permission: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            ask: "ask";
            auto: "auto";
            deny: "deny";
        }>>;
        broadApproval: z.ZodDefault<z.ZodBoolean>;
        autoCommit: z.ZodDefault<z.ZodBoolean>;
        allowShell: z.ZodDefault<z.ZodBoolean>;
        allowedPaths: z.ZodOptional<z.ZodArray<z.ZodString>>;
        allowNetwork: z.ZodDefault<z.ZodBoolean>;
        allowInstall: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    verify: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        command: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    redaction: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    concurrency: z.ZodDefault<z.ZodObject<{
        maxConcurrentAgents: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    catalog: z.ZodDefault<z.ZodObject<{
        remoteUrl: z.ZodOptional<z.ZodString>;
        autoInstall: z.ZodDefault<z.ZodBoolean>;
        proxy: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    costOverrides: z.ZodDefault<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
    trustedRepos: z.ZodDefault<z.ZodDefault<z.ZodArray<z.ZodString>>>;
    timeouts: z.ZodDefault<z.ZodObject<{
        defaultMs: z.ZodDefault<z.ZodNumber>;
        perTool: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, z.core.$strip>>;
    buffers: z.ZodDefault<z.ZodObject<{
        maxBytes: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    logging: z.ZodDefault<z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<{
            error: "error";
            info: "info";
            debug: "debug";
            warn: "warn";
        }>>;
        redact: z.ZodDefault<z.ZodBoolean>;
        rotation: z.ZodDefault<z.ZodObject<{
            maxBytes: z.ZodDefault<z.ZodNumber>;
            maxBackups: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export declare function parseConfig(input: unknown, options?: {
    strict?: boolean;
}): Config;
export declare function safeParseConfig(input: unknown, options?: {
    strict?: boolean;
}): {
    success: true;
    data: Config;
} | {
    success: false;
    error: z.ZodError;
};
/** Format a Zod error into a message naming file and key. */
export declare function formatConfigError(error: z.ZodError, file: string): string;
export {};
