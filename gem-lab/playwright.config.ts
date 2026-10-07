import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const useLocalChrome =
  !process.env.CI && existsSync('/Applications/Google Chrome.app');

export default defineConfig({
  testDir: './tests',
  // tests/unit 是 node:test 单元测试（npm run test:unit），不由 Playwright 收集。
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 4 : 4,
  reporter: process.env.CI ? [['github'], ['json', { outputFile: 'test-results/results.json' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use regular Chromium's new headless mode in CI, closer to local Chrome.
        channel: useLocalChrome ? 'chrome' : 'chromium',
      },
    },
  ],
});
