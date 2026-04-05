import { hasChromeStorageApi, isShowcaseMode, getChromeObject } from '@/services/chrome/runtime.ts'

const memoryStorage = new Map<string, unknown>()

export async function getLocal<T>(key: string): Promise<T | null> {
  if (isShowcaseMode() || !hasChromeStorageApi()) {
    return (memoryStorage.get(key) as T | undefined) ?? null
  }

  const chromeObject = getChromeObject()
  const res = await chromeObject!.storage.local.get(key)
  return (res[key] as T | undefined) ?? null
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  if (isShowcaseMode() || !hasChromeStorageApi()) {
    memoryStorage.set(key, value)
    return
  }

  const chromeObject = getChromeObject()
  await chromeObject!.storage.local.set({ [key]: value })
}
