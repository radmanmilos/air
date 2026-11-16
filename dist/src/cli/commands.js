// Single source of truth for AIR slash commands.
// Used by chat /help, `air commands`, and behavior tests to prevent drift.
export const SLASH_COMMANDS = [
    // Conversation
    { name: '/help', aliases: ['/h', '/?'], group: 'conversation', usage: '/help', description: 'Show this command list.' },
    { name: '/run', group: 'conversation', usage: '/run <task>', description: 'Submit a task for execution.', example: '/run add a README section' },
    { name: '/plan', group: 'conversation', usage: '/plan <goal>', description: 'Plan a task before executing.', example: '/plan refactor the auth module' },
    { name: '/quit', aliases: ['/exit', '/q'], group: 'conversation', usage: '/quit', description: 'Exit the conversation.' },
    // Jobs
    { name: '/jobs', aliases: ['/tasks'], group: 'jobs', usage: '/jobs', description: 'List active jobs.' },
    { name: '/cancel', group: 'jobs', usage: '/cancel [id]', description: 'Cancel the most recent (or specified) job.', example: '/cancel abc123' },
    { name: '/last', group: 'jobs', usage: '/last', description: 'Show the last job result.' },
    // Inspection
    { name: '/status', group: 'inspection', usage: '/status', description: 'Show conversation message and job counts.' },
    { name: '/stats', group: 'inspection', usage: '/stats', description: 'Show message, task and fact counts.' },
];
// Deduplicate by name (help appears in both conversation and system groups conceptually;
// we keep one canonical entry).
const seen = new Set();
export const UNIQUE_SLASH_COMMANDS = SLASH_COMMANDS.filter((c) => {
    if (seen.has(c.name))
        return false;
    seen.add(c.name);
    return true;
});
export function formatHelpText() {
    const groups = {};
    for (const cmd of UNIQUE_SLASH_COMMANDS) {
        if (!groups[cmd.group])
            groups[cmd.group] = [];
        groups[cmd.group].push(cmd);
    }
    const groupLabels = {
        conversation: 'Conversation',
        jobs: 'Jobs',
        inspection: 'Inspection',
        system: 'System',
    };
    const lines = ['Commands:'];
    for (const g of ['conversation', 'jobs', 'inspection', 'system']) {
        const cmds = groups[g];
        if (!cmds || cmds.length === 0)
            continue;
        lines.push(`  ${groupLabels[g]}:`);
        for (const c of cmds) {
            const aliases = c.aliases ? ` (${c.aliases.join(', ')})` : '';
            lines.push(`    ${c.usage.padEnd(20)} ${c.description}${aliases}`);
            if (c.example)
                lines.push(`      e.g. ${c.example}`);
        }
    }
    return lines.join('\n');
}
export function findCommand(input) {
    const name = input.trim().split(/\s+/)[0].toLowerCase();
    return UNIQUE_SLASH_COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}
export function isKnownCommand(input) {
    return findCommand(input) !== undefined;
}
