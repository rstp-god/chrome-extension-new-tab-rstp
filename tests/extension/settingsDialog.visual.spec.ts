import { expect, test } from '@playwright/test'
import { TestId } from '../constants/testIds'
import {
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
} from '../helpers/extension'

async function openSettings(page: Parameters<typeof prepareExtensionPage>[0]) {
  await page.getByTestId(TestId.SettingsTrigger).click()
  await expect(page.getByTestId(TestId.SettingsDialog)).toBeVisible()
}

async function expandAppearance(page: Parameters<typeof prepareExtensionPage>[0]) {
  const section = page.getByTestId(TestId.AppearanceSection)
  // first toggle opens the single outer Appearance accordion
  await section.getByRole('button').first().click()
  // Wait for the inner color-scheme block to render so the snapshot is stable.
  await expect(page.getByTestId(TestId.AppearanceColorScheme)).toBeVisible()
}

test.describe('SettingsDialog visual', () => {
  test('matches closed-appearance dark screenshot', async () => {
    const context = await launchExtensionContext()

    try {
      const page = await context.newPage()
      await prepareExtensionPage(page)
      await openSettings(page)

      await expect(page.getByTestId(TestId.SettingsDialog)).toHaveScreenshot([
        'SettingsDialog',
        'settings-closed-dark.png',
      ])
    } finally {
      await context.close()
    }
  })

  test('matches closed-appearance light screenshot', async () => {
    const context = await launchExtensionContext()

    try {
      const page = await context.newPage()
      await prepareExtensionPage(page)
      await setExtensionTheme(page, 'light')
      await openSettings(page)

      await expect(page.getByTestId(TestId.SettingsDialog)).toHaveScreenshot([
        'SettingsDialog',
        'settings-closed-light.png',
      ])
    } finally {
      await context.close()
    }
  })

  test('matches expanded-appearance dark screenshot', async () => {
    const context = await launchExtensionContext()

    try {
      const page = await context.newPage()
      await prepareExtensionPage(page)
      await openSettings(page)
      await expandAppearance(page)

      await expect(page.getByTestId(TestId.SettingsDialog)).toHaveScreenshot([
        'SettingsDialog',
        'settings-appearance-dark.png',
      ])
    } finally {
      await context.close()
    }
  })

  test('matches expanded-appearance light screenshot', async () => {
    const context = await launchExtensionContext()

    try {
      const page = await context.newPage()
      await prepareExtensionPage(page)
      await setExtensionTheme(page, 'light')
      await openSettings(page)
      await expandAppearance(page)

      await expect(page.getByTestId(TestId.SettingsDialog)).toHaveScreenshot([
        'SettingsDialog',
        'settings-appearance-light.png',
      ])
    } finally {
      await context.close()
    }
  })
})
