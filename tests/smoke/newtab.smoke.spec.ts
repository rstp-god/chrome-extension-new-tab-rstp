import fs from 'node:fs'
import path from 'node:path'
import { test, expect, chromium } from '@playwright/test'

test('loads extension service worker in Chromium', async () => {
  const distDir = path.resolve(process.cwd(), 'dist')
  expect(fs.existsSync(path.join(distDir, 'manifest.json'))).toBe(true)

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  })

  try {
    const worker = await context.waitForEvent('serviceworker')
    expect(worker.url()).toContain('chrome-extension://')
  } finally {
    await context.close()
  }
})
