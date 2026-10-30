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
  .action((task, options) => {
    console.log(chalk.cyan('air run'));
    console.log(chalk.gray('Task:'), task);
    console.log(chalk.yellow('Not implemented yet'));
  });

// `status` and `health` are merged (R-14): status shows tools/providers/models
// and active cooldowns; `health` shows failure history and summary statistics.
const showStatus = () => {
  console.log(chalk.cyan('air status'));
  console.log(chalk.yellow('Not implemented yet'));
};

program
  .command('status')
  .description('Show tools, providers, models, and active cooldowns')
  .action(showStatus);

program
  .command('health')
  .description('Show health/failure history and summary statistics (alias for `air status`)')
  .action(showStatus);

program
  .command('route-test')
  .description('Test routing without executing')
  .argument('<task>', 'Task description')
  .option('--explain', 'Print routing reasoning without executing')
  .action((task, options) => {
    console.log(chalk.cyan('air route-test'));
    console.log(chalk.gray('Task:'), task);
    console.log(chalk.yellow('Not implemented yet'));
  });

program
  .command('config')
  .description('Show or edit configuration')
  .option('--validate', 'Validate config and report errors')
  .action((options) => {
    console.log(chalk.cyan('air config'));
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