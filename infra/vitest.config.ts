import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CDK synthesis is slow on a cold start.
    testTimeout: 60_000,
  },
});
