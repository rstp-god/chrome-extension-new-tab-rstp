import fs from 'node:fs'
import path from 'node:path'
import { BrowserContext, expect, Page, chromium } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'

export const EXTENSION_VIEWPORT = { width: 1440, height: 900 }

const FIXED_TIME_ISO = '2024-01-15T09:00:00.000Z'

export function getDistDir() {
  return path.resolve(process.cwd(), 'dist')
}

export function ensureExtensionBuildExists() {
  const manifestPath = path.join(getDistDir(), 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    throw new Error('dist/manifest.json not found. Run yarn build before browser tests.')
  }
}

export async function launchExtensionContext(): Promise<BrowserContext> {
  ensureExtensionBuildExists()

  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: EXTENSION_VIEWPORT,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--disable-extensions-except=${getDistDir()}`,
      `--load-extension=${getDistDir()}`,
    ],
  })
}

export async function installDeterministicPageState(page: Page) {
  await page.addInitScript((fixedTimeIso) => {
    const RealDate = Date
    const fixedTimestamp = new RealDate(fixedTimeIso).valueOf()

    class MockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTimestamp)
          return
        }

        super(...(args as ConstructorParameters<typeof Date>))
      }

      static now() {
        return fixedTimestamp
      }
    }

    MockDate.UTC = RealDate.UTC
    MockDate.parse = RealDate.parse
    globalThis.Date = MockDate as unknown as DateConstructor
  }, FIXED_TIME_ISO)
}

export async function openExtensionNewTab(page: Page) {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/^chrome-extension:\/\//, { timeout: 20_000 })
}

export async function stabilizeExtensionUi(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        caret-color: transparent !important;
      }

      [data-slot="dialog-overlay"],
      [data-testid="${TestId.AddWidgetPreview}"] {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      [data-testid="${TestId.AddWidgetPreview}"] {
        box-shadow: none !important;
        background: var(--background) !important;
      }
    `,
  })
  await page.waitForFunction(() => document.fonts?.ready instanceof Promise)
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve())
  await page.waitForFunction(() => {
    const bodyText = document.body.innerText
    const hasSettings = /(Settings|Настройки)/.test(bodyText)
    const hasSearch = /(Search|Поиск)/.test(bodyText)
    return hasSettings && hasSearch
  })
}

export async function prepareExtensionPage(page: Page) {
  await installDeterministicPageState(page)
  await openExtensionNewTab(page)
  await stabilizeExtensionUi(page)
}

export async function ensureCustomizeMode(page: Page) {
  const addWidgetTrigger = page.getByTestId(TestId.AddWidgetTrigger)

  if (await addWidgetTrigger.isVisible()) return

  await page.getByTestId(TestId.PinToggle).click()
  await expect(addWidgetTrigger).toBeVisible()
}

export async function addWidget(page: Page, widgetType: 'todo' | 'chromeLibrary') {
  await ensureCustomizeMode(page)
  await page.getByTestId(TestId.AddWidgetTrigger).click()
  await expect(page.getByTestId(testIds.addWidgetItem(widgetType))).toBeVisible()
  await page.getByTestId(testIds.addWidgetButton(widgetType)).click()
  await expect(page.getByTestId(testIds.widgetFrame(widgetType))).toBeVisible()
}
