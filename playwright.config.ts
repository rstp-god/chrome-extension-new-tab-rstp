import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.ts', 'src/widgets/**/*.scenario.spec.ts'],
  snapshotPathTemplate: '{testFileDir}/{projectName}/{arg}{ext}',
  timeout: 60_000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium-mac',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
        timezoneId: 'UTC',
      },
    },
    {
      name: 'chromium-ci',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
        timezoneId: 'UTC',
      },
    },
  ],
})
