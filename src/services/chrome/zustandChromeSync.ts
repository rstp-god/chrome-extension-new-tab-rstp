import {
  hasChromeStorageEvents,
  isShowcaseMode,
  getChromeObject,
} from '@/services/chrome/runtime.ts'
import { getArea, setArea, type StorageArea } from '@/services/chrome/storage.ts'
import type { StateCreator, StoreApi } from 'zustand'
import type { z } from 'zod'

type Area = StorageArea
/** Either a fixed area or a resolver computed from the live store state. */
type AreaOption<TState> = Area | ((state: TState) => Area)

const ORIGIN_ID = crypto.randomUUID()

type StorageChange = { oldValue?: unknown; newValue?: unknown }
type StorageChanges = Record<string, StorageChange>
export type ChromeSyncActions = { commit: () => Promise<void> }
export type Synced<T> = T & ChromeSyncActions

export function withChromeSync<TState extends object, TPersisted>(opts: {
  key: string
  area?: AreaOption<TState>
  partialize: (s: TState) => TPersisted
  schema: z.ZodType<{ meta: { originId: string; rev: number; ts: number }; state: TPersisted }>
  merge: (current: TState, persisted: TPersisted) => Partial<TState>
  autoPersist?: boolean
  debounceMs?: number
}) {
  const { key, area = 'local', partialize, schema, merge, debounceMs = 0, autoPersist = true } = opts

  return (config: StateCreator<TState>): StateCreator<Synced<TState>> =>
    (set, get, api) => {
      let lastRev = 0
      let applyingRemote = false
      // Global timers (not `window.*`): these stores are imported in contexts
      // without a `window` — the node test environment and the SW globalScope.
      let timer: ReturnType<typeof setTimeout> | null = null
      // JSON of the last persisted slice, so identical writes are skipped.
      // Critical on `sync`, which has a write-rate quota: stores with
      // `autoPersist` fire on every state change, but most changes don't
      // touch the (small) persisted slice.
      let lastWrittenJson: string | null = null

      const resolveArea = (state?: TState): Area =>
        typeof area === 'function' ? area(state ?? get()) : area

      const parseEnv = (raw: unknown) => {
        const res = schema.safeParse(raw)
        return res.success ? res.data : null
      }

      const writeNow = async () => {
        const persisted = partialize(get())
        const json = JSON.stringify(persisted)
        if (json === lastWrittenJson) return

        const env = {
          meta: { originId: ORIGIN_ID, rev: ++lastRev, ts: Date.now() },
          state: persisted,
        }
        // Only mark the slice as written if it actually landed. A swallowed
        // sync-quota failure returns false → keep lastWrittenJson stale so the
        // next write of the same payload isn't deduped away and retries.
        const written = await setArea(resolveArea(), key, env)
        if (written) lastWrittenJson = json
      }

      const scheduleWrite = () => {
        if (applyingRemote) return

        if (debounceMs <= 0) {
          void writeNow()
          return
        }

        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void writeNow()
        }, debounceMs)
      }

      const applyEnv = (env: { meta: { rev: number }; state: TPersisted }) => {
        lastRev = env.meta.rev
        lastWrittenJson = JSON.stringify(env.state)
        applyingRemote = true
        set((cur) => merge(cur as unknown as TState, env.state) as Partial<Synced<TState>>)
        applyingRemote = false
      }

      /**
       * Load the initial envelope, resolving which storage area owns it.
       *
       * - Static `sync` store: read sync; if empty, one-time migrate from the
       *   legacy `local` copy (older versions wrote everything to local) so
       *   existing users don't reset to defaults, seeding sync in the process.
       * - Dynamic-area store (e.g. Todo): the area depends on persisted state
       *   we haven't loaded yet, so read BOTH. If the local copy pins itself to
       *   `local` (Todo with an active integration → secrets live device-local),
       *   it wins; otherwise prefer the cross-device `sync` copy.
       */
      const loadInitialEnv = async () => {
        if (typeof area === 'function') {
          const [syncRaw, localRaw] = await Promise.all([
            getArea<unknown>('sync', key),
            getArea<unknown>('local', key),
          ])
          const localEnv = parseEnv(localRaw)
          if (localEnv && area(localEnv.state as unknown as TState) === 'local') {
            return localEnv
          }
          return parseEnv(syncRaw) ?? localEnv
        }

        let raw = await getArea<unknown>(area, key)
        if (!raw && area === 'sync') {
          const legacy = await getArea<unknown>('local', key)
          if (legacy) {
            raw = legacy
            await setArea('sync', key, legacy)
          }
        }
        return parseEnv(raw)
      }

      ;(async () => {
        const env = await loadInitialEnv()
        if (env) applyEnv(env)
      })()

      const onChanged = (changes: StorageChanges, changedArea: string) => {
        if (changedArea !== resolveArea()) return
        const ch = changes[key]
        if (!ch?.newValue) return

        const env = parseEnv(ch.newValue)
        if (!env) return
        if (env.meta.originId === ORIGIN_ID || env.meta.rev <= lastRev) return

        applyEnv(env)
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
