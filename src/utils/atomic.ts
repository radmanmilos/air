// Atomic file write: write to a temp file in the same directory, then rename.
// Safe under concurrent CLI + MCP processes.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  const dir = join(filePath, '..');
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, contents, 'utf8');
  await fs.rename(tmp, filePath);
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}