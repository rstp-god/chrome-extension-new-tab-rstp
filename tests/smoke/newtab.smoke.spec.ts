import fs from 'node:fs'
import path from 'node:path'
import { test, expect, chromium } from '@playwright/test'

test('loads extension newtab UI in Chromium', async () => {
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
    const page = await context.newPage()
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/^chrome-extension:\/\//, { timeout: 20_000 })

    await expect
      .poll(async () => page.evaluate(() => document.body.innerText), {
        timeout: 20_000,
      })
      .toMatch(/(Settings|Search|Настройки)/)
  } finally {
    await context.close()
  }
})
