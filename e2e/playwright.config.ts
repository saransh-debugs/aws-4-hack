import { defineConfig, devices } from '@playwright/test';

/**
 * Task 15: Playwright e2e for the mock-mode happy path
 * (calm -> simulate -> alert -> approve -> dispatched).
 *
 * Runs the web app in fully offline mock mode (VITE_DATA_MODE=mock), so it needs
 * no AWS, no network and no Bedrock. CI starts the Vite dev server via webServer.
 */
const PORT = 5173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // Events arrive paced, like a live feed (apps/web/src/data/pacer.ts): allow for the drama.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -w @gridrisk/web -- --port 5173 --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_DATA_MODE: 'mock' },
  },
});
