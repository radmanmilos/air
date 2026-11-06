#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, migrateConfig } from '../src/config/loader';
import { loadCatalog, catalogTools } from '../src/config/catalog';
import { createHealthTracker } from '../src/health/tracker';
import { selectCandidate, formatRouteDecision } from '../src/router/router';
import { availableAdapters, adapterStatus, refreshAdapterAvailability } from '../src/adapters/registry';
import { Orchestrator } from '../src/orchestrator/orchestrator';
import { installAdapter, upgradeAdapter, uninstallAdapter } from '../src/installer/installer';
import { getInstallStatus } from '../src/installer/status';
import { checkVerifyTrust, runVerify, formatVerifyReport } from '../src/context/verify';
import { startMcp } from '../src/mcp/server';
import { buildModelCatalog, formatModelCatalog, formatBestModel } from '../src/router/catalog';
import { EXIT_CODES } from '../src/types/exit-codes';
import { redact } from '../src/security/redact';

const program = new Command();

program
  .name('air')
  .description('Unified AI tool orchestrator')
  .version('0.2.0')
  .option('--dev', 'Developer mode: verbose diagnostics and full logs');

async function listAdapters(config?: any): Promise<any[]> {
  // Production registry: real adapters only, discovered from PATH.
  // MockAdapter is test-only and injected explicitly by tests.
  if (process.env.MOCK_MODE) {
    const { MockAdapter } = await import('../src/adapters/mock');
    return [new MockAdapter()];
  }
  return availableAdapters(config);
}

function orchestratorFor(config?: any, cacheDir?: string): Orchestrator {
  return new Orchestrator({
    adapters: undefined, // use registry-based discovery
    config,
    cacheDir,
  });
}

async function runAction(task: string, options: { files?: string[]; auto?: boolean; allowDirty?: boolean; readOnly?: boolean; cwd?: string; noTty?: boolean; sessions?: string[]; allowProvider?: string }) {
  if (process.argv.includes('--dev')) process.env.AIR_DEV = '1';
  console.log(chalk.cyan('╔═══════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold('   AIR - Adaptive Intelligence Router  ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('  "AIR is free and so are we"') + chalk.cyan('║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════╝'));
  console.log(chalk.cyan('air run'));
  console.log(chalk.gray('Task:'), task);

  const cwd = options.cwd ?? process.cwd();

  const { config } = await loadConfig({ cwd });
  const orch = orchestratorFor(config, undefined);

  // Multi-session parallel execution: each session runs on its own model.
  if (options.sessions && options.sessions.length > 0) {
    const sessions = [];
    try {
      for (const prompt of options.sessions) {
        const s = await orch.start(prompt, cwd, { mode: options.auto ? 'auto' : 'ask', readOnly: !!options.readOnly, files: options.files });
        sessions.push(s);
      }
      for (const s of sessions) {
        try { await orch.waitFor(s.runId); } catch { /* noop */ }
      }
    } catch (err: any) {
      console.log(chalk.red(err?.message ?? String(err)));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const results = await Promise.all(sessions.map(async (s: any) => {
      const { readTaskState } = await import('../src/execution/task-state');
      const st = await readTaskState(s.runId);
      return st?.result ?? s.result ?? 'FAILED';
    }));
    if (results.includes('CANCELLED')) process.exit(EXIT_CODES.USER_CANCELLED);
    if (results.includes('FAILED')) process.exit(EXIT_CODES.TASK_FAILURE);
    if (results.includes('NO_CHANGES')) process.exit(EXIT_CODES.NO_CHANGES);
    process.exit(EXIT_CODES.SUCCESS);
  }

  const controller = new AbortController();
  const onSig = () => controller.abort();
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  try {
    const session = await orch.start(task, cwd, {
      readOnly: !!options.readOnly,
      mode: options.auto ? 'auto' : 'ask',
      files: options.files,
      maxHops: config.failover.maxHops,
      allowDirty: !!options.allowDirty,
      allowProviders: options.allowProvider ? options.allowProvider.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    });
    // Wait for the async run to finish (background promise).
    try { await orch.waitFor(session.runId); } catch { /* noop */ }
    const s = orch.get(session.runId);
    if (!s) {
      console.log(chalk.red('No session result.'));
      process.exit(EXIT_CODES.TASK_FAILURE);
    }

    if (s.state === 'CANCELLED') {
      console.log(chalk.yellow('Cancelled by user.'));
      process.exit(EXIT_CODES.USER_CANCELLED);
    }
    if (s.state === 'AWAITING_APPROVAL') {
      console.log(chalk.yellow(`Failover proposed for ${session.runId}. Approve to continue.`));
      process.exit(EXIT_CODES.FAILOVER_PROPOSED);
    }
    if (s.result === 'NO_CHANGES') {
      console.log(chalk.yellow('Tool exited 0 but no workspace changes detected (NO_CHANGES).'));
      process.exit(EXIT_CODES.NO_CHANGES);
    }
    if (s.result === 'SUCCEEDED_WITH_CHANGES' || s.result === 'SUCCEEDED_READ_ONLY') {
      console.log(chalk.green(`Succeeded (${s.result}).`));
      process.exit(EXIT_CODES.SUCCESS);
    }
    // FAILED or unknown
    console.log(chalk.red(`Failed.`));
    process.exit(EXIT_CODES.TASK_FAILURE);
  } catch (err: any) {
    const msg = String(err?.message || err);
    // Dirty tree refusal from orchestrator.
    if (msg.includes('Working tree is dirty') || msg.includes('Not a Git repository')) {
      console.log(chalk.red(msg));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    // No eligible candidate.
    if (msg.includes('No eligible candidate') || msg.includes('Hop cap reached')) {
      console.log(chalk.red(msg));
      console.log(chalk.gray('No eligible candidate.'));
      process.exit(EXIT_CODES.ALL_EXHAUSTED);
    }
    console.log(chalk.red(msg));
    process.exit(EXIT_CODES.TASK_FAILURE);
  }
}

function showStatus(options: { json?: boolean }) {
  const tracker = createHealthTracker();
  return tracker.load().then(() => {
    const snap = tracker.snapshot();
    const data = {
      command: 'status',
      version: '0.1.0',
      tools: adapterStatus(),
      cooldowns: snap.cooldowns.map((c) => ({
        provider: c.provider,
        model: c.model,
        until: c.until,
        reason: c.reason,
      })),
      health: {
        totalSuccesses: snap.totalSuccesses,
        totalFailures: snap.totalFailures,
        successRate: snap.successRate,
        hasActiveCooldown: snap.hasActiveCooldown,
      },
    };
    if (options.json) {
      process.stdout.write(JSON.stringify(data) + '\n');
      return;
    }
    console.log(chalk.cyan('air status'));
    console.log(chalk.gray('Tools:'), data.tools.map((t) => {
      const inst = t.installed ? `installed${t.version ? ` v${t.version}` : ''}` : 'not-installed';
      return `${t.id} (${inst})${t.available ? '' : ' (unavailable)'}`;
    }).join(', ') || 'none');
    console.log(chalk.gray('Cooldowns:'), data.cooldowns.length);
    console.log(chalk.gray('Successes:'), snap.totalSuccesses);
    console.log(chalk.gray('Failures:'), snap.totalFailures);
    console.log(chalk.gray('Active cooldown:'), snap.hasActiveCooldown ? 'yes' : 'no');
  });
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
  .action(async (task: string, options: { explain?: boolean; json?: boolean }) => {
    const tracker = createHealthTracker();
    await tracker.load();
    const decision = selectCandidate(
      { id: 'route-test', prompt: task, cwd: process.cwd(), mode: 'ask' },
      await listAdapters(),
      tracker,
    );
    const report = formatRouteDecision(decision);
    const payload = {
      command: 'route-test',
      task,
      chosen: decision.chosen ? { id: decision.chosen.id, provider: decision.chosen.provider, model: decision.chosen.model } : null,
      skips: decision.skips,
      considered: decision.considered,
    };
    if (options.json) {
      process.stdout.write(JSON.stringify(payload) + '\n');
      return;
    }
    console.log(chalk.cyan('air route-test'));
    console.log(report);
  });

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
  .action(async () => {
    // MCP speaks JSON-RPC on stdout; diagnostics go to stderr only.
    process.stderr.write('air mcp: starting MCP server on stdio\n');
    await startMcp();
  });

program
  .command('verify')
  .description('Run an approved verification command (array args, no shell)')
  .argument('<cmd...>', 'Command and arguments')
  .option('--cwd <dir>', 'Working directory')
  .action(async (cmd: string[], options: { cwd?: string }) => {
    // CLI-supplied commands are always trusted (G3-11).
    const trust = checkVerifyTrust(cmd, [], options.cwd ?? process.cwd(), 'cli');
    if (!trust.trusted) {
      console.log(chalk.red(`Verify refused: ${trust.reason}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const result = await runVerify(cmd, options.cwd ?? process.cwd());
    console.log(formatVerifyReport(result));
    process.exit(result.ok ? 0 : 1);
  });

program
  .command('verify-repo')
  .description('Run the repo-configured verify command through the trust gate')
  .option('--cwd <dir>', 'Working directory')
  .action(async (options: { cwd?: string }) => {
    const cwd = options.cwd ?? process.cwd();
    const { config } = await loadConfig({ cwd });
    if (!config.verify.enabled || !config.verify.command) {
      console.log(chalk.yellow('No verify command configured for this repo.'));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    // Repo-config commands are refused unless the cwd is in the global
    // trusted-repos list (G3-11). CLI-supplied commands are always trusted.
    const trust = checkVerifyTrust([config.verify.command], config.trustedRepos ?? [], cwd, 'repo');
    if (!trust.trusted) {
      console.log(chalk.red(`Verify refused: ${trust.reason}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const cmd = config.verify.command.split(/\s+/).filter(Boolean);
    const result = await runVerify(cmd, cwd);
    console.log(formatVerifyReport(result));
    process.exit(result.ok ? 0 : 1);
  });

program
  .command('dashboard')
  .description('Show orchestrator sessions, decisions, and events')
  .action(async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { paths } = await import('../src/config/paths');
    const file = join(paths.cacheDir, 'orchestrator.json');
    if (!existsSync(file)) {
      console.log('No orchestrator sessions yet.');
      return;
    }
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    console.log('=== AIR Dashboard ===');
    console.log(`Sessions: ${raw.sessions?.length ?? 0}`);
    for (const s of raw.sessions ?? []) {
      console.log(`- ${s.runId}: ${s.adapterId} (${s.provider}/${s.model}) ${s.state} ${s.result ?? ''}`);
    }
    console.log(`Events: ${raw.events?.length ?? 0}`);
    // Conversations (T7-034)
    const { listConversations } = await import('../src/conversation');
    const convIds = listConversations();
    console.log(`Conversations: ${convIds.length}`);
    for (const cid of convIds.slice(-10)) {
      console.log(`- ${cid}`);
    }
    for (const e of (raw.events ?? []).slice(-10)) {
      console.log(`  ${e.ts} ${e.type}: ${e.detail}`);
    }
    const statuses = adapterStatus();
    console.log('\n--- Adapters ---');
    for (const s of statuses) {
      const inst = s.installed ? `installed${s.version ? ` v${s.version}` : ''}` : 'not-installed';
      console.log(`- ${s.id} (${s.provider}/${s.model}): ${inst} ${s.installStatus} verified=${s.verified} available=${s.available}`);
    }
    console.log('--- Help (type /command) ---');
    console.log('  /run /status /dashboard /export /models /verify /mcp');
  });

program
  .command('export')
  .description('Export orchestrator session log and events for debugging')
  .option('--out <file>', 'Output file', 'air-export.json')
  .action(async (options: { out: string }) => {
    const { readFileSync, existsSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { paths } = await import('../src/config/paths');
    const file = join(paths.cacheDir, 'orchestrator.json');
    if (!existsSync(file)) {
      console.log('No orchestrator log found.');
      return;
    }
    const raw = readFileSync(file, 'utf8');
    writeFileSync(options.out, raw);
    console.log(`Exported orchestrator log to ${options.out}`);
  });

program
  .command('commands')
  .description('List available commands (side-panel help)')
  .action(() => {
    console.log('AIR commands:');
    console.log('  /run <task>        Run a task');
    console.log('  /status            Show health and cooldowns');
    console.log('  /dashboard         Show sessions and events');
    console.log('  /export            Export session log');
    console.log('  /models            List models');
    console.log('  /verify <cmd...>   Run verification');
    console.log('  /mcp               Start MCP server');
    console.log('Type "/" then a command, or run "air <command>".');
  });

program
  .command('models')
  .description('List registered adapters with provider/model and capabilities')
  .option('--best <task>', 'Recommend the best model for a task')
  .action((options: { best?: string }) => {
    const adapters = availableAdapters();
    const catalog = buildModelCatalog(adapters);
    if (options.best) {
      console.log(formatBestModel(catalog, { mode: 'ask', readOnly: false }));
      return;
    }
    console.log(formatModelCatalog(catalog));
  });

const adaptersCmd = program
  .command('adapters')
  .description('Manage installable free AI adapters');

adaptersCmd
  .command('list')
  .description('List all catalog entries with install status')
  .option('--json', 'Emit machine-readable JSON')
  .action(async (options: { json?: boolean }) => {
    const { config } = await loadConfig({ cwd: process.cwd() });
    const catalog = await loadCatalog(config);
    const tools = catalogTools(catalog);
    const statuses = adapterStatus(config);
    const statusMap = new Map(statuses.map((s) => [s.id, s]));

    const rows = tools.map((t) => {
      const s = statusMap.get(t.id);
      return {
        id: t.id,
        name: t.name,
        adapterId: t.adapterId,
        provider: t.provider,
        model: t.model,
        installed: s?.installed ?? false,
        version: s?.version,
        installStatus: s?.installStatus ?? 'not-installed',
        available: s?.available ?? false,
        verified: s?.verified ?? false,
      };
    });

    if (options.json) {
      process.stdout.write(JSON.stringify(rows) + '\n');
      return;
    }
    console.log(chalk.cyan('air adapters list'));
    for (const r of rows) {
      const inst = r.installed ? `installed${r.version ? ` v${r.version}` : ''}` : 'not-installed';
      const verified = r.verified ? ' [verified]' : '';
      console.log(`  ${r.id}${verified}: ${inst} (${r.installStatus})`);
    }
  });

adaptersCmd
  .command('install <id>')
  .description('Install a free AI adapter')
  .option('--yes', 'Skip confirmation prompt')
  .action(async (id: string, options: { yes?: boolean }) => {
    const { config } = await loadConfig({ cwd: process.cwd() });
    const catalog = await loadCatalog(config);
    const entry = catalog.tools.find((t) => t.id === id);
    if (!entry) {
      console.log(chalk.red(`Unknown adapter: ${id}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const current = getInstallStatus(id, entry.executable);
    if (current.status === 'installed') {
      console.log(chalk.yellow(`${id} is already installed (v${current.version})`));
      return;
    }
    if (!options.yes) {
      console.log(chalk.yellow(`About to install ${id} (${entry.name}). This modifies your system.`));
      console.log(chalk.cyan('Proceed? [y/N] '));
      const answer = await new Promise<string>((resolve) => {
        process.stdin.once('data', (d) => resolve(d.toString().trim().toLowerCase()));
        process.stdin.resume();
      });
      if (answer !== 'y' && answer !== 'yes') {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }
    try {
      const result = await installAdapter(entry, config);
      console.log(chalk.green(`${id}: ${result.status}`));
      if (result.version) console.log(chalk.gray(`  version: ${result.version}`));
      if (result.error) console.log(chalk.red(`  error: ${result.error}`));
    } catch (err: any) {
      console.log(chalk.red(`Install failed: ${err?.message || err}`));
      process.exit(EXIT_CODES.TASK_FAILURE);
    }
  });

adaptersCmd
  .command('upgrade <id>')
  .description('Upgrade an adapter to the catalog version')
  .option('--yes', 'Skip confirmation prompt')
  .action(async (id: string, options: { yes?: boolean }) => {
    const { config } = await loadConfig({ cwd: process.cwd() });
    const catalog = await loadCatalog(config);
    const entry = catalog.tools.find((t) => t.id === id);
    if (!entry) {
      console.log(chalk.red(`Unknown adapter: ${id}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const current = getInstallStatus(id, entry.executable);
    if (current.status === 'installed' && current.version === entry.install.version) {
      console.log(chalk.yellow(`${id} is already at v${entry.install.version}`));
      return;
    }
    if (!options.yes) {
      console.log(chalk.yellow(`About to upgrade ${id} to v${entry.install.version}.`));
      console.log(chalk.cyan('Proceed? [y/N] '));
      const answer = await new Promise<string>((resolve) => {
        process.stdin.once('data', (d) => resolve(d.toString().trim().toLowerCase()));
        process.stdin.resume();
      });
      if (answer !== 'y' && answer !== 'yes') {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }
    try {
      const result = await upgradeAdapter(entry, config);
      console.log(chalk.green(`${id}: ${result.status}`));
      if (result.version) console.log(chalk.gray(`  version: ${result.version}`));
    } catch (err: any) {
      console.log(chalk.red(`Upgrade failed: ${err?.message || err}`));
      process.exit(EXIT_CODES.TASK_FAILURE);
    }
  });

adaptersCmd
  .command('uninstall <id>')
  .description('Uninstall an adapter')
  .option('--yes', 'Skip confirmation prompt')
  .action(async (id: string, options: { yes?: boolean }) => {
    const { config } = await loadConfig({ cwd: process.cwd() });
    const catalog = await loadCatalog(config);
    const entry = catalog.tools.find((t) => t.id === id);
    if (!entry) {
      console.log(chalk.red(`Unknown adapter: ${id}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    if (!options.yes) {
      console.log(chalk.yellow(`About to uninstall ${id}.`));
      console.log(chalk.cyan('Proceed? [y/N] '));
      const answer = await new Promise<string>((resolve) => {
        process.stdin.once('data', (d) => resolve(d.toString().trim().toLowerCase()));
        process.stdin.resume();
      });
      if (answer !== 'y' && answer !== 'yes') {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }
    try {
      await uninstallAdapter(entry);
      console.log(chalk.green(`${id}: uninstalled`));
    } catch (err: any) {
      console.log(chalk.red(`Uninstall failed: ${err?.message || err}`));
      process.exit(EXIT_CODES.TASK_FAILURE);
    }
  });

adaptersCmd
  .command('status <id>')
  .description('Show detailed install status for one adapter')
  .action(async (id: string) => {
    const { config } = await loadConfig({ cwd: process.cwd() });
    const catalog = await loadCatalog(config);
    const entry = catalog.tools.find((t) => t.id === id);
    if (!entry) {
      console.log(chalk.red(`Unknown adapter: ${id}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const status = getInstallStatus(id, entry.executable);
    const refreshed = refreshAdapterAvailability(id);
    console.log(chalk.cyan(`air adapters status ${id}`));
    console.log(chalk.gray(`  name:          ${entry.name}`));
    console.log(chalk.gray(`  adapterId:     ${entry.adapterId}`));
    console.log(chalk.gray(`  provider:      ${entry.provider}`));
    console.log(chalk.gray(`  model:         ${entry.model}`));
    console.log(chalk.gray(`  executable:    ${entry.executable}`));
    console.log(chalk.gray(`  installed:     ${status.installed}`));
    console.log(chalk.gray(`  version:       ${status.version ?? 'n/a'}`));
    console.log(chalk.gray(`  status:        ${status.status}`));
    console.log(chalk.gray(`  available:     ${refreshed?.available ?? false}`));
    console.log(chalk.gray(`  installAttempts: ${status.installAttempts}`));
    if (status.error) console.log(chalk.red(`  error:         ${status.error}`));
  });

program
  .command('resume')
  .description('Resume a previous session with optional new task')
  .argument('<runId>', 'Previous session run id')
  .argument('[task]', 'New task (defaults to previous task)')
  .option('--cwd <dir>', 'Working directory (default: current directory)')
  .action(async (runId: string, task?: string, options?: { cwd?: string }) => {
    const cwd = options?.cwd ?? process.cwd();
    const { config } = await loadConfig({ cwd });
    const orch = orchestratorFor(config, undefined);
    try {
      const session = await orch.resume(runId, task);
      console.log(chalk.green(`Resumed ${session.runId} (parent: ${runId})`));
      console.log(chalk.gray(`Adapter: ${session.adapterId} (${session.provider}/${session.model})`));
      console.log(chalk.gray(`State: ${session.state}`));
      console.log(chalk.gray(`Result: ${session.result ?? 'pending'}`));
      process.exit(EXIT_CODES.SUCCESS);
    } catch (err: any) {
      console.log(chalk.red(String(err?.message || err)));
      process.exit(EXIT_CODES.TASK_FAILURE);
    }
  });

program
  .command('run')
  .description('Route and run a task')
  .argument('<task>', 'Task description')
  .option('-f, --files <files...>', 'Files to include')
  .option('--auto', 'Auto-switch on failover')
  .option('--allow-dirty', 'Allow running on a dirty working tree (non-destructive)')
  .option('--read-only', 'Treat the task as read-only; empty diff is a valid outcome')
  .option('--cwd <dir>', 'Working directory (default: current directory)')
  .option('--no-tty', 'Disable interactive prompts (non-interactive failover)')
  .option('--allow-provider <providers>', 'Allow failover to these providers (comma-separated)')
  .option('--sessions <tasks...>', 'Run multiple tasks concurrently, each on its own model')
  .action(runAction);

program
  .command('chat')
  .description('Interactive conversation (non-blocking follow-ups)')
  .option('--resume <id>', 'Resume a conversation')
  .option('--free-only', 'Prefer free models (default true)')
  .action(async (options: { resume?: string; freeOnly?: boolean }) => {
    const { createConversation, loadConversation, saveConversation, appendMessage, injectResult } = await import('../src/conversation');
    const { decide } = await import('../src/conversation/decide');
    const { planFromRequest } = await import('../src/planner');
    const { compileJobResult } = await import('../src/result-compiler');
    const { loadConfig } = await import('../src/config/loader');
    const readline = await import('node:readline');
    const cwd = process.cwd();
    const { config } = await loadConfig({ cwd });
    let conv = options.resume ? loadConversation(options.resume) : null;
    if (!conv) conv = createConversation({ freeOnly: options.freeOnly !== false });
    saveConversation(conv);
    console.log(chalk.cyan(`air chat (conversation ${conv.id})`));
    console.log(chalk.gray('Type a message, /run <task>, /status, /jobs, /cancel <id>, /last, /help, /quit'));

    const eventLog = process.env.AIR_EVENT_LOG;
    const logEvent = (type: string, detail: string) => {
      if (!eventLog) return;
      try {
        const fs = require('node:fs');
        fs.appendFileSync(eventLog, JSON.stringify({ ts: new Date().toISOString(), type, detail }) + '\n');
      } catch { /* noop */ }
    };

    const waiters = new Map<string, Promise<void>>();
    const jobHandles = new Map<string, { orch: any; controller: AbortController }>();

    async function runJob(task: string, _workId?: string, hints?: { requiresWrite?: boolean; requiresCode?: boolean }): Promise<void> {
      const requiresWrite = hints?.requiresWrite !== false;
      const controller = new AbortController();
      // Build worker prompt from conversation context (T7-009).
      const contextParts = [task];
      if (conv!.summary) contextParts.push(`Context summary: ${conv!.summary}`);
      if (conv!.facts.length > 0) contextParts.push(`Facts: ${conv!.facts.join('; ')}`);
      const enriched = contextParts.join('\n');
      const { Orchestrator } = await import('../src/orchestrator/orchestrator');
      const orch = new (Orchestrator as any)({ config, mcpMode: true, onFailoverPropose: async () => true });
      const plan = planFromRequest(enriched, { requiresWrite, requiresCode: hints?.requiresCode !== false });
      const item = plan.workItems[0];
      const session = await orch.start(item.objective, cwd, { mode: 'auto', readOnly: !requiresWrite, freeOnly: conv!.userPreferences.freeOnly, controller });
      jobHandles.set(session.runId, { orch, controller });
      await appendMessage(conv!.id, { role: 'assistant', content: `Started job ${session.runId}.` });
      logEvent('job_started', session.runId);
      logEvent('notice_printed', `Started job ${session.runId}`);
      console.log(chalk.green(`Started job ${session.runId}`));
      conv!.activeWorkIds.push(session.runId);
      saveConversation(conv!);
      // Background waiter.
      const p = (async () => {
        try {
          // poll task state until terminal
          const { readTaskState } = await import('../src/execution/task-state');
          let state: any = null;
          while (true) {
            state = await readTaskState(session.runId);
            if (state && (state.state === 'COMPLETED' || state.state === 'FAILED' || state.state === 'CANCELLED')) break;
            await new Promise((r) => setTimeout(r, 500));
          }
          const facts = {
            runId: session.runId,
            result: state?.result ?? state?.state ?? 'FAILED',
            adapterId: state?.adapter ?? session.adapterId,
            provider: state?.provider ?? session.provider,
            model: state?.model ?? session.model,
            durationMs: undefined,
            changedFiles: state?.delta ? [...(state.delta.staged||[]), ...(state.delta.unstaged||[]), ...(state.delta.untracked||[])] : [],
            verifyOk: undefined,
            outputTail: state?.outputTail,
            error: state?.error,
          };
          const summary = compileJobResult(facts as any);
          await injectResult(conv!.id, summary, session.runId);
          conv!.activeWorkIds = conv!.activeWorkIds.filter((x) => x !== session.runId);
          // update facts
          const bullet = `Job ${session.runId} ${facts.result}: ${facts.changedFiles?.length ?? 0} changed`;
          if (!conv!.facts.includes(bullet)) conv!.facts.push(bullet);
          saveConversation(conv!);
          logEvent('job_finished', `${session.runId}: ${summary.split('.')[0]}`);
          console.log(chalk.gray(`job ${session.runId} finished: ${summary.split('.')[0]}.`));
        } catch (err) {
          console.log(chalk.red(`job ${session.runId} error: ${String(err)}`));
        }
      })();
      waiters.set(session.runId, p);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      logEvent('command_handled', trimmed);
      logEvent('message_received', trimmed);
      if (trimmed === '/quit' || trimmed === '/exit') { rl.close(); return; }
      if (trimmed === '/help') {
        console.log(chalk.gray('Commands: /run <task>, /plan <goal>, /status, /jobs, /cancel <id>, /last, /stats, /tasks, /quit'));
        return;
      }
      if (trimmed === '/status') { const c = (await import('../src/conversation')).loadConversation(conv!.id) ?? conv!; console.log(chalk.gray(`messages=${c.messages.length} active=${c.activeWorkIds.join(',')}`)); return; }
      if (trimmed === '/jobs' || trimmed === '/tasks') {
        console.log(chalk.gray(`active: ${conv!.activeWorkIds.join(',') || '(none)'}`));
        return;
      }
      if (trimmed === '/stats') {
        console.log(chalk.gray(`messages=${conv!.messages.length} tasks=${conv!.activeWorkIds.length} facts=${conv!.facts.length}`));
        return;
      }
      if (trimmed === '/last') {
        const last = [...conv!.messages].reverse().find((m) => m.role === 'tool');
        console.log(chalk.gray(last ? last.content : '(no result yet)'));
        return;
      }
       if (trimmed.startsWith('/cancel ')) {
        const id = trimmed.slice(8).trim();
        const entry = jobHandles.get(id);
        if (!entry) {
          console.log(chalk.yellow(`No such job: ${id}`));
          return;
        }
        try { await entry.orch.cancel(id); } catch { /* noop */ }
        entry.controller.abort();
        conv!.activeWorkIds = conv!.activeWorkIds.filter((x) => x !== id);
        saveConversation(conv!);
        console.log(chalk.yellow(`Cancelled ${id}`));
        return;
      }
      if (trimmed.startsWith('/run ') || trimmed.startsWith('/plan ')) {
        const task = trimmed.replace(/^\/(run|plan) /, '').trim();
        await appendMessage(conv!.id, { role: 'user', content: task });
        void runJob(task);
        return;
      }
      // Decision loop.
      await appendMessage(conv!.id, { role: 'user', content: trimmed });
      const actions = decide(trimmed, conv!);
      for (const a of actions) {
        if (a.type === 'spawn_job') {
          logEvent('job_submitted', a.goal);
          void runJob(a.goal, undefined, a.hints);
        } else if (a.type === 'answer') {
          (async () => {
            const { brainAnswer, isBrainAvailable } = await import('../src/brain');
            let reply = 'Acknowledged.';
            if (await isBrainAvailable()) {
              process.stdout.write(chalk.gray('air: thinking...\\n'));
              logEvent('brain_start', trimmed);
              const freshConv = loadConversation(conv!.id) ?? conv!;
              const r = await brainAnswer(trimmed, { history: freshConv.messages, jobs: freshConv.activeWorkIds });
              process.stdout.write('\r' + ' '.repeat(20) + '\r');
              logEvent('brain_end', r.text.slice(0, 200));
              reply = r.text;
            }
            await appendMessage(conv!.id, { role: 'assistant', content: reply });
            console.log(chalk.gray(`air: ${reply}`));
          })().catch((err) => {
            console.log(chalk.red(`brain error: ${String(err)}`));
          });
        } else if (a.type === 'clarify') {
          await appendMessage(conv!.id, { role: 'assistant', content: a.question });
          console.log(chalk.gray(`air: ${a.question}`));
        } else if (a.type === 'status') {
          console.log(chalk.gray(`messages=${conv!.messages.length} active=${conv!.activeWorkIds.join(',')}`));
        } else if (a.type === 'cancel_job') {
          const entry = jobHandles.get(a.jobId);
          if (entry) {
            try { await entry.orch.cancel(a.jobId); } catch { /* noop */ }
            entry.controller.abort();
          }
          conv!.activeWorkIds = conv!.activeWorkIds.filter((x) => x !== a.jobId);
          saveConversation(conv!);
          console.log(chalk.yellow(`Cancelled ${a.jobId}`));
        }
      }
    });
    rl.on('close', async () => { try { await Promise.all([...waiters.values()]); } catch {} process.exit(0); });
  });

program
  .command('merge')
  .description('Apply a completed job worktree into the current branch')
  .argument('<jobId>', 'Job run id')
  .action(async (jobId: string) => {
    const { readTaskState } = await import('../src/execution/task-state');
    const st: any = await readTaskState(jobId);
    if (!st || !st.worktreePath || !st.sourceCwd) {
      console.log(chalk.red('No worktree info for job.'));
      process.exit(1);
    }
    const { applyWorktree } = await import('../src/workspace');
    const info = { jobId, sourceCwd: st.sourceCwd, worktreePath: st.worktreePath, branch: st.worktreeBranch, sourceHead: '' };
    const res = applyWorktree(info as any);
    console.log(res.ok ? chalk.green(res.message) : chalk.red(res.message));
    process.exit(res.ok ? 0 : 1);
  });

program.parse();
