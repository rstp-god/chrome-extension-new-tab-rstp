import {
  hasChromeStorageEvents,
  isShowcaseMode,
  getChromeObject,
} from '@/services/chrome/runtime.ts'
import { getLocal, setLocal } from '@/services/chrome/storage.ts'
import type { StateCreator, StoreApi } from 'zustand'
import type { z } from 'zod'

type Area = 'local' | 'sync'

const ORIGIN_ID = crypto.randomUUID()

type StorageChange = { oldValue?: unknown; newValue?: unknown }
type StorageChanges = Record<string, StorageChange>
export type ChromeSyncActions = { commit: () => Promise<void> }
export type Synced<T> = T & ChromeSyncActions

export function withChromeSync<TState extends object, TPersisted>(opts: {
  key: string
  area?: Area
  partialize: (s: TState) => TPersisted
  schema: z.ZodType<{ meta: { originId: string; rev: number; ts: number }; state: TPersisted }>
  merge: (current: TState, persisted: TPersisted) => Partial<TState>
  autoPersist?: boolean
  debounceMs?: number
}) {
  const {
    key,
    area = 'local',
    partialize,
    schema,
    merge,
    debounceMs = 0,
    autoPersist = true,
  } = opts

  return (config: StateCreator<TState>): StateCreator<Synced<TState>> =>
    (set, get, api) => {
      let lastRev = 0
      let applyingRemote = false
      let timer: number | null = null

      const writeNow = async () => {
        const persisted = partialize(get())
        const env = {
          meta: { originId: ORIGIN_ID, rev: ++lastRev, ts: Date.now() },
          state: persisted,
        }
        await setLocal(key, env)
      }

      const scheduleWrite = () => {
        if (applyingRemote) return

        if (debounceMs <= 0) {
          void writeNow()
          return
        }

        if (timer !== null) window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          timer = null
          void writeNow()
        }, debounceMs)
      }

      const parseEnv = (raw: unknown) => {
        const res = schema.safeParse(raw)
        return res.success ? res.data : null
      }

      ;(async () => {
        const raw = await getLocal<unknown>(key)
        const env = parseEnv(raw)
        if (!env) return

        lastRev = env.meta.rev

        applyingRemote = true
        set((cur) => {
          const patch = merge(cur as unknown as TState, env.state)
          return patch as Partial<Synced<TState>>
        })
        applyingRemote = false
      })()

      const onChanged = (changes: StorageChanges, changedArea: string) => {
        if (changedArea !== area) return
        const ch = changes[key]
        if (!ch?.newValue) return

        const env = parseEnv(ch.newValue)
        if (!env) return
        if (env.meta.originId === ORIGIN_ID || env.meta.rev <= lastRev) return

        lastRev = env.meta.rev

        applyingRemote = true
        set((cur) => {
          const patch = merge(cur as unknown as TState, env.state)
          return patch as Partial<Synced<TState>>
        })
        applyingRemote = false
      }

      const chromeObject = getChromeObject()
      if (!isShowcaseMode() && hasChromeStorageEvents()) {
        chromeObject?.storage.onChanged.addListener(onChanged)
      }

      if (autoPersist) {
        const storeApi = api as StoreApi<TState>
        storeApi.subscribe(() => scheduleWrite())
      }

      const base = config(set, get, api)
      return {
        ...base,
        commit: writeNow,
      }
    }
}
