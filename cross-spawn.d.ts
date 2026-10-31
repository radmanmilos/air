// Ambient declaration for cross-spawn.
// No @types/cross-spawn package is published, so declare the shape locally.
// Placed at the repo root so it is always picked up by every tsconfig.

declare module 'cross-spawn' {
  import { spawn as nodeSpawn } from 'node:child_process';
  export function spawn(
    command: string,
    args?: readonly string[],
    options?: nodeSpawn.SpawnOptions,
  ): ReturnType<typeof nodeSpawn>;
}