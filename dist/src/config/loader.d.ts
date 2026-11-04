import { type Config } from './schema';
export interface LoadOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    cliOverrides?: Partial<Config>;
    strict?: boolean;
}
export declare function loadConfig(options?: LoadOptions): Promise<{
    config: Config;
    errors: string[];
}>;
export declare function validateConfigFile(file: string): Promise<string[]>;
export declare function migrateConfig(): Promise<{
    ok: boolean;
    message: string;
}>;
