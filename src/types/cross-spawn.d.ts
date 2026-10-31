// Ambient declaration for cross-spawn.
// No @types/cross-spawn package is published, so declare the shape locally.
// This file is included by both tsconfig.json and tsconfig.test.json.

declare module 'cross-spawn' {
  import { spawn as nodeSpawn } from 'node:child_process';
  export function spawn(
    command: string,
    args?: readonly string[],
    options?: nodeSpawn.SpawnOptions,
  ): ReturnType<typeof nodeSpawn>;
}