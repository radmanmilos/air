// Central platform path resolver.
// Every feature (config, cache, task state, logs, traces, health) must use
// this module. No feature may hard-code ~/.config or ~/.cache.

import { homedir } from 'node:os';
import { join } from 'node:path';

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

function detectPlatform(nodePlatform: string = process.platform): Platform {
  if (nodePlatform === 'win32') return 'win32';
  if (nodePlatform === 'darwin') return 'darwin';
  if (nodePlatform === 'linux') return 'linux';
  return 'other';
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
export function resolvePaths(
  options: {
    platform?: Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
  } = {},
): AirPaths {
  const platform = options.platform ?? detectPlatform();
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();

  let configDir: string;
  let cacheDir: string;

  switch (platform) {
    case 'win32': {
      configDir = env.APPDATA ? join(env.APPDATA, 'air') : join(home, 'AppData', 'Roaming', 'air');
      cacheDir = env.LOCALAPPDATA
        ? join(env.LOCALAPPDATA, 'air')
        : join(home, 'AppData', 'Local', 'air');
      break;
    }
    case 'darwin': {
      configDir = join(home, 'Library', 'Application Support', 'air');
      cacheDir = join(home, 'Library', 'Caches', 'air');
      break;
    }
    case 'linux':
    default: {
      const xdgConfig = env.XDG_CONFIG_HOME || join(home, '.config');
      const xdgCache = env.XDG_CACHE_HOME || join(home, '.cache');
      configDir = join(xdgConfig, 'air');
      cacheDir = join(xdgCache, 'air');
      break;
    }
  }

  return {
    configDir,
    cacheDir,
    globalConfigFile: join(configDir, 'config.yaml'),
    healthFile: join(cacheDir, 'health.json'),
    tasksDir: join(cacheDir, 'tasks'),
    tracesDir: join(cacheDir, 'traces'),
    logFile: join(cacheDir, 'air.log'),
  };
}

/** The default singleton used by the rest of the app. */
export const paths = resolvePaths();