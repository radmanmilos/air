import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLASH_COMMANDS, formatHelpText, findCommand, isKnownCommand, UNIQUE_SLASH_COMMANDS } from '../src/cli/commands';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

describe('slash command registry', () => {
  it('includes all supported commands', () => {
    const names = UNIQUE_SLASH_COMMANDS.map((c) => c.name);
    expect(names).toContain('/help');
    expect(names).toContain('/run');
    expect(names).toContain('/plan');
    expect(names).toContain('/quit');
    expect(names).toContain('/jobs');
    expect(names).toContain('/cancel');
    expect(names).toContain('/last');
    expect(names).toContain('/status');
    expect(names).toContain('/stats');
  });

  it('every command has a description and usage', () => {
    for (const cmd of UNIQUE_SLASH_COMMANDS) {
      expect(cmd.description.length).toBeGreaterThan(0);
      expect(cmd.usage.length).toBeGreaterThan(0);
    }
  });

  it('formatHelpText includes all command names', () => {
    const text = formatHelpText();
    for (const cmd of UNIQUE_SLASH_COMMANDS) {
      expect(text).toContain(cmd.name);
    }
  });

  it('findCommand resolves aliases', () => {
    expect(findCommand('/h')?.name).toBe('/help');
    expect(findCommand('/?')?.name).toBe('/help');
    expect(findCommand('/exit')?.name).toBe('/quit');
    expect(findCommand('/q')?.name).toBe('/quit');
    expect(findCommand('/tasks')?.name).toBe('/jobs');
  });

  it('isKnownCommand returns true for known commands', () => {
    expect(isKnownCommand('/help')).toBe(true);
    expect(isKnownCommand('/run foo')).toBe(true);
    expect(isKnownCommand('/unknown')).toBe(false);
  });

  it('formatHelpText groups commands', () => {
    const text = formatHelpText();
    expect(text).toContain('Conversation:');
    expect(text).toContain('Jobs:');
    expect(text).toContain('Inspection:');
  });
});

describe('terminal escape sequences (regression)', () => {
  it('dist contains actual escape sequences, not literal backslash text', () => {
    const dist = readFileSync(join(ROOT, 'dist', 'bin', 'air.js'), 'utf8');
    expect(dist).toContain("'\\u001b[2K\\r'");
    expect(dist).not.toContain("'\\\\u001b[2K\\\\r'");
  });
});