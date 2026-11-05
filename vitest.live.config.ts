import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 120000,
  },
});