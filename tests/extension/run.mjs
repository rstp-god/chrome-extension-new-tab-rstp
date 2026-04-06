/* global process, console, setTimeout, document, HTMLElement, MouseEvent */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const rootDir = process.cwd()
const distDir = path.join(rootDir, 'dist')
const manifestPath = path.join(distDir, 'manifest.json')
const snapshotDir = path.join(rootDir, 'tests/extension/snapshots')
const baselineDir = path.join(snapshotDir, 'baseline')
const actualDir = path.join(snapshotDir, 'actual')
const diffDir = path.join(snapshotDir, 'diff')
const updateSnapshots = process.argv.includes('--update-snapshots')
let hasCommittedBaselines = false

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function ensureBuildExists() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('dist/manifest.json not found. Run yarn build:test-extension before test:extension')
  }
}

function detectCommittedBaselines() {
  if (!fs.existsSync(baselineDir)) return false

  const entries = fs.readdirSync(baselineDir)
  return entries.some((entry) => entry.endsWith('.png'))
}

function compareScreenshots(name) {
  const baselinePath = path.join(baselineDir, `${name}.png`)
  const actualPath = path.join(actualDir, `${name}.png`)
  const diffPath = path.join(diffDir, `${name}.png`)

  const baseline = PNG.sync.read(fs.readFileSync(baselinePath))
  const actual = PNG.sync.read(fs.readFileSync(actualPath))

  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    throw new Error(`Snapshot dimensions mismatch for ${name}`)
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height })
  const mismatchCount = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, {
    threshold: 0.1,
  })

  fs.writeFileSync(diffPath, PNG.sync.write(diff))
  return mismatchCount
}

function assertSnapshot(name) {
  const baselinePath = path.join(baselineDir, `${name}.png`)
  const actualPath = path.join(actualDir, `${name}.png`)

  if (updateSnapshots) {
    fs.copyFileSync(actualPath, baselinePath)
    console.log(`[snapshot] baseline updated: ${name}`)
    return
  }

  if (!fs.existsSync(baselinePath)) {
    if (!hasCommittedBaselines) {
      fs.copyFileSync(actualPath, baselinePath)
      console.log(`[snapshot] baseline bootstrapped: ${name}`)
      return
    }

    throw new Error(
      `Missing baseline snapshot for ${name}. Run "yarn test:extension --update-snapshots" to create it.`,
    )
  }

  const mismatches = compareScreenshots(name)
  if (mismatches > 0) {
    throw new Error(`Visual diff detected for ${name}: ${mismatches} pixels differ`)
  }
}

async function screenshotPage(page, name) {
  const actualPath = path.join(actualDir, `${name}.png`)
  await page.screenshot({ path: actualPath, fullPage: true })
  assertSnapshot(name)
}

async function hoverAndShootPreview(page, itemIndex, shotName) {
  const hovered = await page.evaluate((index) => {
    const items = Array.from(document.querySelectorAll('[data-slot="item"]'))
    const target = items[index]
    if (!(target instanceof HTMLElement)) return false
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    return true
  }, itemIndex)

  if (!hovered) throw new Error(`Preview item not found at index ${itemIndex}`)

  await new Promise((resolve) => setTimeout(resolve, 300))
  await screenshotPage(page, shotName)
}

async function ensureTestPage(page) {
  await page.goto('chrome://newtab/', { waitUntil: 'networkidle0' })
  await page.setViewport({ width: 1440, height: 900 })
  await new Promise((resolve) => setTimeout(resolve, 500))

  const hasExtensionUi = await page.evaluate(() => {
    const text = document.body.innerText
    return text.includes('Settings') || text.includes('Search') || text.includes('Настройки')
  })

  if (hasExtensionUi) return

  const fallbackPageUrl = `file://${path.join(distDir, 'src/newtab/index.html')}`
  await page.goto(fallbackPageUrl, { waitUntil: 'networkidle0' })
  await new Promise((resolve) => setTimeout(resolve, 500))
}

async function run() {
  ensureBuildExists()
  ensureDir(baselineDir)
  ensureDir(actualDir)
  ensureDir(diffDir)
  hasCommittedBaselines = detectCommittedBaselines()

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
    defaultViewport: { width: 1440, height: 900 },
  })

  try {
    const page = await browser.newPage()

    await ensureTestPage(page)
    await screenshotPage(page, 'newtab-default')

    await page.evaluate(() => {
      const firstButton = document.querySelector('button')
      if (firstButton instanceof HTMLElement) {
        firstButton.click()
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 300))

    const dialogOpened = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const addWidgetButton = buttons.find((node) =>
        /(Add\s*widget|addWidget|Добавить\s*виджет)/i.test(node.textContent ?? ''),
      )

      if (addWidgetButton instanceof HTMLElement) {
        addWidgetButton.click()
        return true
      }

      const fallback = buttons[1]
      if (fallback instanceof HTMLElement) {
        fallback.click()
        return true
      }

      return false
    })

    if (!dialogOpened) throw new Error('Add widget button not found')
    await new Promise((resolve) => setTimeout(resolve, 300))

    await hoverAndShootPreview(page, 0, 'preview-search')
    await hoverAndShootPreview(page, 1, 'preview-todo')
    await hoverAndShootPreview(page, 2, 'preview-chrome-library')

    console.log('[snapshot] extension snapshot run completed')
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
