import { resolvePaths } from '../../src/config/paths';
import { describe, it, expect } from 'vitest';

describe('path resolver (G2-07, R2-08)', () => {
  it('resolves Linux paths with XDG overrides', () => {
    const p = resolvePaths({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: '/cfg', XDG_CACHE_HOME: '/cache', HOME: '/home/u' },
      home: '/home/u',
    });
    expect(p.configDir).toBe('/cfg/air');
    expect(p.cacheDir).toBe('/cache/air');
    expect(p.globalConfigFile).toBe('/cfg/air/config.yaml');
    expect(p.healthFile).toBe('/cache/air/health.json');
  });

  it('resolves Linux paths with fallbacks', () => {
    const p = resolvePaths({
      platform: 'linux',
      env: { HOME: '/home/u' },
      home: '/home/u',
    });
    expect(p.configDir).toBe('/home/u/.config/air');
    expect(p.cacheDir).toBe('/home/u/.cache/air');
  });

  it('resolves macOS paths', () => {
    const p = resolvePaths({
      platform: 'darwin',
      env: {},
      home: '/Users/u',
    });
    expect(p.configDir).toBe('/Users/u/Library/Application Support/air');
    expect(p.cacheDir).toBe('/Users/u/Library/Caches/air');
  });

  it('resolves Windows paths', () => {
    const p = resolvePaths({
      platform: 'win32',
      env: { APPDATA: 'C:\\AppData', LOCALAPPDATA: 'C:\\LocalAppData' },
      home: 'C:\\Users\\u',
    });
    expect(p.configDir).toBe('C:\\AppData\\air');
    expect(p.cacheDir).toBe('C:\\LocalAppData\\air');
  });

  it('uses all the same central paths', () => {
    const p = resolvePaths({ platform: 'linux', env: { HOME: '/h' }, home: '/h' });
    expect(p.tasksDir).toBe(p.cacheDir + '/tasks');
    expect(p.tracesDir).toBe(p.cacheDir + '/traces');
  });
});