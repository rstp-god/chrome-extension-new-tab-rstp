import { expect, test } from '@playwright/test'
import { TestId } from '../constants/testIds'
import {
  installDeterministicPageState,
  launchExtensionContext,
  openExtensionNewTab,
  stabilizeExtensionUi,
} from '../helpers/extension'

test.describe('Appearance', () => {
  test('default preset preserves original muted-foreground from styles.css', async () => {
    const context = await launchExtensionContext()
    try {
      const page = await context.newPage()
      await installDeterministicPageState(page)
      await openExtensionNewTab(page)
      await stabilizeExtensionUi(page)

      // The default preset must not regress the mid-tone foregrounds shipped
      // in styles.css — if useApplyAppearance wrote pure white/black via
      // computeForeground, this value would be `oklch(0.98 0 0)` on dark theme.
      const mutedForeground = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim(),
      )

      // Matches styles.css .dark --muted-foreground value
      expect(mutedForeground).toMatch(/oklch\(0\.714/)
    } finally {
      await context.close()
    }
  })

  test('changing radius preset updates --radius custom property', async () => {
    const context = await launchExtensionContext()
    try {
      const page = await context.newPage()
      await installDeterministicPageState(page)
      await openExtensionNewTab(page)
      await stabilizeExtensionUi(page)

      // Open settings dialog
      await page.getByTestId(TestId.SettingsTrigger).click()
      await expect(page.getByTestId(TestId.SettingsDialog)).toBeVisible()

      // Expand the Appearance accordion
      await page.getByTestId(TestId.AppearanceSection).getByRole('button').first().click()

      // Switch radius to Pill preset (1.5rem)
      const radiusSection = page.getByTestId(TestId.AppearanceRadiusSlider)
      await radiusSection.getByRole('radio', { name: /pill|капсула/i }).click()

      const radius = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--radius').trim(),
      )

      expect(radius).toBe('1.5rem')
    } finally {
      await context.close()
    }
  })

  test('switching color scheme updates --primary', async () => {
    const context = await launchExtensionContext()
    try {
      const page = await context.newPage()
      await installDeterministicPageState(page)
      await openExtensionNewTab(page)
      await stabilizeExtensionUi(page)

      const primaryBefore = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      )

      await page.getByTestId(TestId.SettingsTrigger).click()
      await page.getByTestId(TestId.AppearanceSection).getByRole('button').first().click()

      const colorSection = page.getByTestId(TestId.AppearanceColorScheme)
      await colorSection.getByRole('radio', { name: /ocean|океан/i }).click()

      const primaryAfter = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      )

      expect(primaryAfter).not.toBe(primaryBefore)
      expect(primaryAfter).toMatch(/oklch\(0\.55 0\.15 230/)
    } finally {
      await context.close()
    }
  })
})
