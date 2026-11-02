import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Single fork: several test files mutate the same global cache
    // (health.json, task index, traces) and parallel workers race on
    // Windows rename(). Serializing keeps the on-disk state consistent.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
    extensions: ['.ts', '.js', '.mjs', '.json'],
  },
});