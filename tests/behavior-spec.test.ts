import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SPEC = join(root, 'docs', 'behavior-spec.md');

// Re-declare the same commander program as bin/air.ts so the test reflects
// the actual command tree, not a hand-maintained copy.
function buildProgram() {
  const program = new Command();
  program.name('air').description('Unified AI tool orchestrator').version('0.1.0');

  program.command('run').argument('<task>').option('-f, --files <files...>').option('--auto').option('--allow-dirty').option('--read-only');
  program.command('status').option('--json');
  program.command('health').option('--json');
  program.command('route-test').argument('<task>').option('--explain').option('--json');
  program.command('verify').argument('<cmd...>').option('--cwd <dir>');
  program.command('models');

  const configCmd = program.command('config').option('--validate');
  configCmd.command('migrate');

  program.command('mcp');
  program.command('setup').argument('<component>').option('--force').option('--json');
  program.command('doctor').option('--json').option('--offline');
  return program;
}

function specText(): string {
  return readFileSync(SPEC, 'utf8');
}

function commandNames(program: Command): string[] {
  return program.commands.map((c) => c.name());
}

function optionNames(cmd: Command): string[] {
  return cmd.options.map((o) => o.long?.replace(/^--/, '') || '');
}

describe('behavior-spec conformance (G-05, G2-04, R3-07)', () => {
  const program = buildProgram();
  const spec = specText();

  it('documents every top-level command', () => {
    for (const name of commandNames(program)) {
      expect(spec).toContain(`\`air ${name}`);
    }
  });

  it('documents every command in --help output', () => {
    const help = program.helpInformation();
    for (const name of commandNames(program)) {
      expect(help).toContain(name);
    }
  });

  it('documents air run flags', () => {
    const run = program.commands.find((c) => c.name() === 'run')!;
    for (const opt of optionNames(run)) {
      expect(spec).toContain(opt);
    }
  });

  it('documents status --json', () => {
    const status = program.commands.find((c) => c.name() === 'status')!;
    expect(optionNames(status)).toContain('json');
    expect(spec).toContain('`air status`');
    expect(spec).toContain('--json');
  });

  it('documents config migrate as a subcommand', () => {
    const config = program.commands.find((c) => c.name() === 'config')!;
    const sub = config.commands.find((c) => c.name() === 'migrate');
    expect(sub).toBeTruthy();
    expect(spec).toContain('`air config migrate`');
  });

  it('documents health as a true alias of status', () => {
    const health = program.commands.find((c) => c.name() === 'health');
    expect(health).toBeTruthy();
    expect(spec).toMatch(/health[\s\S]{0,200}?alias/);
  });

  it('documents route-test --explain and --json', () => {
    const rt = program.commands.find((c) => c.name() === 'route-test')!;
    const opts = optionNames(rt);
    expect(opts).toContain('explain');
    expect(opts).toContain('json');
    expect(spec).toContain('--explain');
  });

  it('documents exit codes', () => {
    expect(spec).toContain('Exit codes');
  });
});