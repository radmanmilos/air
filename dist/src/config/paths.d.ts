export type Platform = 'win32' | 'darwin' | 'linux' | 'other';
export interface AirPaths {
    configDir: string;
    cacheDir: string;
    globalConfigFile: string;
    healthFile: string;
    tasksDir: string;
    tracesDir: string;
    logFile: string;
}
/**
 * Resolve air paths for a platform.
 *
 * | Platform | Config | Cache |
 * |---|---|---|
 * | Linux | `$XDG_CONFIG_HOME/air` (fallback `~/.config/air`) | `$XDG_CACHE_HOME/air` (fallback `~/.cache/air`) |
 * | macOS | `~/Library/Application Support/air` | `~/Library/Caches/air` |
 * | Windows | `%APPDATA%/air` | `%LOCALAPPDATA%/air` |
 */
export declare function resolvePaths(options?: {
    platform?: Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
}): AirPaths;
/** The default singleton used by the rest of the app. */
export declare const paths: AirPaths;
