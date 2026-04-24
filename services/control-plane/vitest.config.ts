import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 10_000,
    setupFiles: ['./vitest.setup.ts'],
  },
});
