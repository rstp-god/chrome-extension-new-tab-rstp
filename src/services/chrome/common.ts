type ChromeApiName = 'bookmarks' | 'tabs' | 'tabGroups'

export function getChromeObject() {
  return (globalThis as { chrome?: typeof chrome }).chrome ?? null
}

export function hasChromeApis(required: ChromeApiName[]) {
  const chromeObject = getChromeObject()
  if (!chromeObject) return false

  return required.every((name) => Boolean(chromeObject[name]))
}

export async function openUrlInNewTab(url: string): Promise<void> {
  const chromeObject = getChromeObject()

  if (!chromeObject?.tabs?.create) {
    window.open(url, '_blank')
    return
  }

  try {
    await chromeObject.tabs.create({ url })
  } catch {
    window.open(url, '_blank')
  }
}
