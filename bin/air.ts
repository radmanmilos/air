#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, migrateConfig } from '../src/config/loader';
import { createHealthTracker } from '../src/health/tracker';
import { MockAdapter } from '../tests/mock-adapter';
import { runProcess } from '../src/execution/runner';
import { classifyOutcome } from '../src/types/outcome';
import { getErrorAction, type ErrorCategory } from '../src/types/errors';
import { redact } from '../src/security/redact';

const program = new Command();

program
  .name('air')
  .description('Unified AI tool orchestrator')
  .version('0.1.0');

program
  .command('run')
  .description('Route and run a task')
  .argument('<task>', 'Task description')
  .option('-f, --files <files...>', 'Files to include')
  .option('--auto', 'Auto-switch on failover')
  .option('--allow-dirty', 'Allow running on a dirty working tree (non-destructive)')
  .option('--read-only', 'Treat the task as read-only; empty diff is a valid outcome')
  .action(async (task: string, options: { files?: string[]; auto?: boolean; allowDirty?: boolean; readOnly?: boolean }) => {
    console.log(chalk.cyan('air run'));
    console.log(chalk.gray('Task:'), task);

    const adapter = new MockAdapter();
    const spec = adapter.buildCommand({
      id: 'run-1',
      prompt: task,
      cwd: process.cwd(),
      files: options.files,
      mode: options.auto ? 'auto' : 'ask',
      readOnly: !!options.readOnly,
    });

    const { outcome } = await runProcess(spec, {
      timeoutMs: 60_000,
      maxBufferBytes: 1_000_000,
      onStdout: (c: string) => process.stdout.write(c),
      onStderr: (c: string) => process.stderr.write(c),
    });

    const fact = classifyOutcome(outcome);
    let category: ErrorCategory = (fact.category as ErrorCategory) ?? adapter.classifyError(outcome.exitCode, outcome.stderr);

    if (outcome.cancelled) {
      console.log(chalk.yellow('Cancelled by user.'));
      process.exit(3);
    }
    if (outcome.timedOut) {
      console.log(chalk.red('Timed out.'));
      process.exit(1);
    }
    if (outcome.spawnError) {
      console.log(chalk.red(`Tool not available: ${outcome.spawnError.message}`));
      process.exit(1);
    }
    if (outcome.exitCode !== 0) {
      console.log(chalk.red(`Failed (${category}). Action: ${getErrorAction(category)}`));
      process.exit(1);
    }
    console.log(chalk.green('Succeeded.'));
    process.exit(0);
  });

// `status` and `health` are merged (R-14, R2-07): status shows tools/providers/models
// and active cooldowns; `health` is a true alias showing the identical report.
async function showStatus(options: { json?: boolean }) {
  const tracker = createHealthTracker();
  await tracker.load();
  const data = {
    command: 'status',
    version: '0.1.0',
    tools: [{ id: 'mock', provider: 'openrouter', model: 'mock-model', available: true }],
    providers: ['openrouter'],
    models: ['mock-model'],
    cooldowns: tracker.getCooldowns().map((c) => ({
      provider: c.provider,
      model: c.model,
      until: c.until,
      reason: c.reason,
    })),
    health: [],
  };
  if (options.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }
  console.log(chalk.cyan('air status'));
  console.log(chalk.gray('Tools:'), data.tools.map((t) => t.id).join(', ') || 'none');
  console.log(chalk.gray('Cooldowns:'), data.cooldowns.length);
}

program
  .command('status')
  .description('Show tools, providers, models, and active cooldowns')
  .option('--json', 'Emit machine-readable JSON')
  .action(showStatus);

program
  .command('health')
  .description('Alias for `air status` (tools, providers, models, and active cooldowns)')
  .option('--json', 'Emit machine-readable JSON')
  .action(showStatus);

program
  .command('route-test')
  .description('Test routing without executing')
  .argument('<task>', 'Task description')
  .option('--explain', 'Print routing reasoning without executing')
  .option('--json', 'Emit machine-readable JSON')
  .action((task: string) => {
    console.log(chalk.cyan('air route-test'));
    console.log(chalk.gray('Task:'), task);
    console.log(chalk.yellow('Not implemented yet'));
  });

// `air config` shows/validates; `air config migrate` upgrades schema versions.
const configCmd = program
  .command('config')
  .description('Show or edit configuration')
  .option('--validate', 'Validate config and report errors')
  .action(async (options: { validate?: boolean }) => {
    if (options.validate) {
      const { config, errors } = await loadConfig({ cwd: process.cwd() });
      if (errors.length > 0) {
        for (const e of errors) console.log(chalk.red(redact(e)));
        process.exit(4);
      }
      console.log(chalk.green('Config is valid.'));
      console.log(chalk.gray('Version:'), config.version);
      console.log(chalk.gray('Failover mode:'), config.failover.mode);
      return;
    }
    console.log(chalk.cyan('air config'));
    console.log(chalk.yellow('Not implemented yet'));
  });

configCmd
  .command('migrate')
  .description('Upgrade config to the current schema version')
  .action(async () => {
    const result = await migrateConfig();
    if (result.ok) {
      console.log(chalk.green(result.message));
    } else {
      console.log(chalk.red(result.message));
      process.exit(4);
    }
  });

program
  .command('mcp')
  .description('Start MCP server (stdio)')
  .action(() => {
    console.log(chalk.cyan('air mcp'));
    console.log(chalk.yellow('Not implemented yet'));
  });

program.parse();