export type RuntimeMode = 'extension' | 'showcase'

const DEFAULT_RUNTIME_MODE: RuntimeMode = 'extension'

export function getRuntimeMode(): RuntimeMode {
  const mode = import.meta.env.VITE_RUNTIME_MODE
  return mode === 'showcase' || mode === 'extension' ? mode : DEFAULT_RUNTIME_MODE
}

export function isShowcaseMode(): boolean {
  return getRuntimeMode() === 'showcase'
}

export function getChromeObject() {
  return (globalThis as { chrome?: typeof chrome }).chrome ?? null
}

export function hasChromeStorageApi(): boolean {
  const chromeObject = getChromeObject()
  return Boolean(chromeObject?.storage?.local)
}

export function hasChromeStorageEvents(): boolean {
  const chromeObject = getChromeObject()
  return Boolean(chromeObject?.storage?.onChanged)
}
