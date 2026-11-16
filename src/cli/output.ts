// Terminal output helpers.
//
// Single choke point for interactive presentation decisions. The goal is to
// make AIR's terminal output:
//   1. Clean and restrained in interactive mode (no banners, no spinners).
//   2. Identical in non-TTY mode (no color, no cursor control, no interstitials).
//   3. Overridable with --no-color / NO_COLOR / FORCE_COLOR.
//
// Nothing here performs authorization. It only decides what is *presented*.

import chalk from 'chalk';

/** True when stdout is a TTY and color is not explicitly disabled. */
export function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR === '0' || process.env.FORCE_COLOR === 'false') return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return Boolean(process.stdout.isTTY);
}

/** True when AIR may use interactive presentation (TTY stdin + stdout). */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// chalk with level 0 is a no-op: every style returns its input unchanged.
// This is the simplest way to get color/no-color from one import.
export function configureColor(): void {
  chalk.level = supportsColor() ? 1 : 0;
}

export const out = {
  cyan: (s: string): string => chalk.cyan(s),
  gray: (s: string): string => chalk.gray(s),
  bold: (s: string): string => chalk.bold(s),
  yellow: (s: string): string => chalk.yellow(s),
  red: (s: string): string => chalk.red(s),
  green: (s: string): string => chalk.green(s),
};

/** One-line startup header. No box, no slogan, no banner. */
export function startupHeader(version: string, extra?: string): string {
  const base = `AIR ${version}`;
  return extra ? `${base}  ·  ${extra}` : base;
}

/** Plain log line to stdout. */
export function log(message: string): void {
  process.stdout.write(message + '\n');
}

/** Status line to stderr (diagnostics only; never stdout). */
export function status(message: string): void {
  process.stderr.write(message + '\n');
}

/** Print the first-run welcome. Never installs or starts anything. */
export async function printWelcome(version: string): Promise<void> {
  const lines = [
    `AIR ${version}  ·  local-first AI agent`,
    '',
    'AIR is a single terminal entrypoint that routes tasks across AI coding',
    'tools and its own local models. You talk to one agent; the tools are',
    'interchangeable hands in the background.',
    '',
    'Next steps:',
    '  air doctor          check whether a local job can run',
    '  air setup local     provision the internal local worker (optional)',
    '  air status          show tools, models and cooldowns',
    '  air chat            start a conversation',
    '  air --help          list all commands',
    '',
  ];
  for (const l of lines) process.stdout.write(l + '\n');
}