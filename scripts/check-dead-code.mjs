// Dead-code check: runs knip and fails on any unused export/type that is not
// part of the intentional baseline below. Baselined items are module-level
// public APIs / transitional exports knip cannot resolve as used from the
// entry points (bin/air.ts, src/index.ts, src/mcp/server.ts).
//
// A new unused export/type added to src/ or bin/ causes a non-zero exit.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const knipCli = join(process.cwd(), 'node_modules', 'knip', 'dist', 'cli.js');

const BASELINE = new Set([
	// adapter runner entry points (registry uses class-based adapters)
	'src/adapters/aider.ts#runAider',
	'src/adapters/goose.ts#runGoose',
	'src/adapters/kilocode.ts#runKilocode',
	'src/adapters/opencode.ts#runOpenCode',
	'src/adapters/codex.ts#runCodex',
	'src/adapters/github-copilot.ts#runGitHubCopilot',
	// registry helpers
	'src/adapters/registry.ts#routedAdapters',
	'src/adapters/registry.ts#ensureDynamicAdaptersLoaded',
	'src/adapters/registry.ts#getDynamicAdapters',
	'src/adapters/conformance.ts#getErrorAction',
	// catalog
	'src/config/catalog.ts#catalogTool',
	'src/config/catalog.ts#DownloadUrl',
	// context
	'src/context/handoff.ts#buildHandoffFromSnapshot',
	// health
	'src/health/tracker.ts#healthSnapshot',
	'src/health/tracker.ts#HealthSnapshot',
	// installer
	'src/installer/status.ts#isInstalled',
	'src/installer/installer.ts#PlatformInfo',
	// permissions
	'src/permissions/index.ts#conforms',
	'src/permissions/index.ts#PermissionMode',
	// planner
	'src/planner/index.ts#WorkItemSchema',
	'src/planner/index.ts#PlanSchema',
	'src/planner/index.ts#validatePlan',
	'src/planner/index.ts#TaskType',
	'src/planner/index.ts#WorkItem',
	// router
	'src/router/free-tiers.ts#setFreeTierOverrides',
	'src/router/free-tiers.ts#loadFreeTierOverridesFromEnv',
	// conversation
	'src/conversation/decide.ts#DecideHints',
	'src/conversation/chat-provider.ts#ChatProvider',
	// security
	'src/security/allowlist.ts#isProviderAllowed',
	'src/security/allowlist.ts#isModelAllowed',
	'src/security/streaming-redact.ts#containsSecret',
	// execution
	'src/execution/sessions.ts#assertSessionIsolation',
	// workspace
	'src/workspace/index.ts#worktreeDiff',
	// local worker provisioning (public surface used by the CLI and the M4 adapter)
	'src/worker/provision.ts#ProvisionStep',
	'src/worker/provision.ts#DoctorCheckId',
	'src/worker/provision.ts#DoctorCheck',
	'src/worker/provision.ts#SystemPython',
	// job contract types (consumed by the local adapter and tests)
	'src/contracts/job.ts#JobErrorCategory',
	'src/contracts/job.ts#JobState',
	'src/contracts/job.ts#JobRequest',
	'src/contracts/job.ts#JobToolCall',
	'src/contracts/job.ts#JobResult',
	// evaluation contracts/helpers (P1-03 schema/tool-context integrity)
	'src/evals/runner.ts#suiteContract',
	'src/evals/contracts/coordinator.ts#ACTION_SCHEMA',
	'src/evals/contracts/coordinator.ts#coordinatorFormat',
	'src/evals/contracts/planner.ts#PLANNER_SCHEMA',
	'src/evals/contracts/planner.ts#plannerFormat',
	'src/evals/contracts/tools.ts#EVAL_TOOL_REGISTRY',
	'src/conversation/actions.ts#parseActions',
	'src/conversation/actions.ts#Action',
]);

let output = '';
let knipFailed = false;
try {
	output = execFileSync(process.execPath, [knipCli, '--reporter', 'json', '--no-progress'], {
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024,
	}).toString();
} catch (err) {
	knipFailed = true;
	output =
		typeof err.stdout === 'string' ? err.stdout : err.stdout != null ? Buffer.from(err.stdout).toString('utf8') : '';
}

let issues = [];
try {
	issues = JSON.parse(output).issues || [];
} catch {
	if (!knipFailed) {
		console.error('dead-code check: could not parse knip report');
		process.exit(1);
	}
	// knip reported issues (non-zero exit) but stdout wasn't captured; treat
	// the whole run as having found issues beyond baseline only if we can parse.
	process.exit(1);
}

const remaining = [];
for (const issue of issues) {
	const file = issue.file;
	for (const e of issue.exports || []) {
		const key = `${file}#${e.name}`;
		if (!BASELINE.has(key)) remaining.push(`export ${key}`);
	}
	for (const t of issue.types || []) {
		const key = `${file}#${t.name}`;
		if (!BASELINE.has(key)) remaining.push(`type ${key}`);
	}
}

if (remaining.length > 0) {
	console.error('dead-code check: new unused exports/types detected:');
	for (const item of remaining) console.error(`  - ${item}`);
	process.exit(1);
}
process.exit(0);
