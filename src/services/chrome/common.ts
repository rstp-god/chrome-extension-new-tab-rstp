export function getChromeObject() {
  return (globalThis as { chrome?: typeof chrome }).chrome ?? null
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
