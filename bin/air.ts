#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

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
  .action((task, options) => {
    console.log(chalk.cyan('air run'));
    console.log(chalk.gray('Task:'), task);
    console.log(chalk.yellow('Not implemented yet'));
  });

// `status` and `health` are merged (R-14, R2-07): status shows tools/providers/models
// and active cooldowns; `health` is a true alias showing the identical report.
const showStatus = (options: { json?: boolean }) => {
  if (options.json) {
    process.stdout.write(JSON.stringify({
      command: 'status',
      version: '0.1.0',
      tools: [],
      providers: [],
      models: [],
      cooldowns: [],
      health: [],
    }) + '\n');
    return;
  }
  console.log(chalk.cyan('air status'));
  console.log(chalk.yellow('Not implemented yet'));
};

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
  .action((task, options) => {
    console.log(chalk.cyan('air route-test'));
    console.log(chalk.gray('Task:'), task);
    console.log(chalk.yellow('Not implemented yet'));
  });

// `air config` shows/validates; `air config migrate` upgrades schema versions.
const configCmd = program
  .command('config')
  .description('Show or edit configuration')
  .option('--validate', 'Validate config and report errors')
  .action((options) => {
    if (options.validate) {
      console.log(chalk.cyan('air config --validate'));
      console.log(chalk.yellow('Not implemented yet'));
      return;
    }
    console.log(chalk.cyan('air config'));
    console.log(chalk.yellow('Not implemented yet'));
  });

configCmd
  .command('migrate')
  .description('Upgrade config to the current schema version')
  .action(() => {
    console.log(chalk.cyan('air config migrate'));
    console.log(chalk.yellow('Not implemented yet'));
  });

program
  .command('mcp')
  .description('Start MCP server (stdio)')
  .action(() => {
    console.log(chalk.cyan('air mcp'));
    console.log(chalk.yellow('Not implemented yet'));
  });

program.parse();