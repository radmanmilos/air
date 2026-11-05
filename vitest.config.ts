import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
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