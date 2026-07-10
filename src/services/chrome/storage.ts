import { hasChromeStorageApi, isShowcaseMode, getChromeObject } from '@/services/chrome/runtime.ts'

export type StorageArea = 'local' | 'sync'

const memoryStorage = new Map<string, unknown>()

export async function getArea<T>(area: StorageArea, key: string): Promise<T | null> {
  if (isShowcaseMode() || !hasChromeStorageApi()) {
    return (memoryStorage.get(key) as T | undefined) ?? null
  }

  const chromeObject = getChromeObject()
  const res = await chromeObject!.storage[area].get(key)
  return (res[key] as T | undefined) ?? null
}

/**
 * Persist `value` under `key` in the given area. Returns `true` on success.
 * A rejected `sync` write is swallowed (returns `false`) so the UI never
 * breaks on quota — callers use the result to know the write didn't land and
 * a later (distinct/debounced) write should retry. `local` errors rethrow.
 */
export async function setArea(area: StorageArea, key: string, value: unknown): Promise<boolean> {
  if (isShowcaseMode() || !hasChromeStorageApi()) {
    memoryStorage.set(key, value)
    return true
  }

  const chromeObject = getChromeObject()
  try {
    await chromeObject!.storage[area].set({ [key]: value })
    return true
  } catch (err) {
    if (area === 'sync') {
      console.warn('[storage] sync write failed:', err)
      return false
    }
    throw err
  }
}

export async function removeArea(area: StorageArea, key: string): Promise<void> {
  if (isShowcaseMode() || !hasChromeStorageApi()) {
    memoryStorage.delete(key)
    return
  }

  const chromeObject = getChromeObject()
  try {
    await chromeObject!.storage[area].remove(key)
  } catch (err) {
    if (area === 'sync') {
      console.warn('[storage] sync remove failed:', err)
      return
    }
    throw err
  }
}

// Backwards-compatible thin wrappers over the local area. Existing callers
// (popup, Productivity dailyCache, tests) keep working unchanged.
export const getLocal = <T>(key: string) => getArea<T>('local', key)
export const setLocal = (key: string, value: unknown) => setArea('local', key, value)
