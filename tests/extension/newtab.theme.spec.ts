import { expect, test } from '@playwright/test'
import {
  installDeterministicPageState,
  launchExtensionContext,
  openExtensionNewTab,
  setExtensionTheme,
  stabilizeExtensionUi,
} from '../helpers/extension'

test('matches light theme screenshot', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await installDeterministicPageState(page)
    await openExtensionNewTab(page)
    await stabilizeExtensionUi(page)
    await setExtensionTheme(page, 'light')

    await expect(page).toHaveScreenshot(['NewTabTheme', 'newtab-light.png'])
  } finally {
    await context.close()
  }
})

test('matches dark theme screenshot', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await installDeterministicPageState(page)
    await openExtensionNewTab(page)
    await stabilizeExtensionUi(page)

    await setExtensionTheme(page, 'dark')
    await expect(page).toHaveScreenshot(['NewTabTheme', 'newtab-dark.png'])
  } finally {
    await context.close()
  }
})
