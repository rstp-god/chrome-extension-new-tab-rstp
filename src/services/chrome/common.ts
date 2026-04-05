import { getChromeObject } from '@/services/chrome/runtime.ts'

export { getChromeObject }

export async function openUrlInNewTab(url: string): Promise<void> {
  const chromeObject = getChromeObject()

  if (!chromeObject?.tabs?.create) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  try {
    await chromeObject.tabs.create({ url })
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
