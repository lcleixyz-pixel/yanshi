import { defineConfig, devices } from '@playwright/test';

const useMesa = process.env.CI_WEBGL_BACKEND === 'mesa';

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
  // Emit each test start on its own line so a hung worker is identifiable in CI.
  reporter: process.env.CI ? [['line'], ['github'], ['json', { outputFile: 'test-results/results.json' }]] : 'list',
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
        // Use Playwright's matching Chromium locally and in CI (new headless mode).
        // System Chrome on macOS can leave crashpad holding stderr open, blocking teardown.
        channel: 'chromium',
        // Xvfb + Mesa exercises the same WebGL app without SwiftShader's
        // severe vertex-throughput bottleneck on the hosted Linux runner.
        headless: !useMesa,
        launchOptions: useMesa ? {
          args: ['--use-gl=angle', '--use-angle=gl', '--ozone-platform=x11', '--ignore-gpu-blocklist'],
          ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
        } : undefined,
      },
    },
  ],
});
