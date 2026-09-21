import {
  hasChromeStorageEvents,
  isShowcaseMode,
  getChromeObject,
} from '@/services/chrome/runtime.ts'
import { getArea, removeArea, setArea, type StorageArea } from '@/services/chrome/storage.ts'
import type { StateCreator, StoreApi } from 'zustand'
import type { z } from 'zod'

type Area = StorageArea
/** Either a fixed area or a resolver computed from the live store state. */
type AreaOption<TState> = Area | ((state: TState) => Area)

const ORIGIN_ID = crypto.randomUUID()

/**
 * The value with every object turned into its sorted entries, so that two
 * records differing only in key order have the same JSON.
 *
 * `undefined` members are dropped, which is what `JSON.stringify` does to
 * them anyway — an absent key and a key holding `undefined` are the same
 * record once it has been through storage.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value

  return Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, member]) => [name, canonicalize(member)])
}

/** Key-order-insensitive JSON, for comparing a stored record with a parsed one. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

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

        const resolved = resolveArea()
        const written = await setArea(resolved, key, env)
        if (written) {
          lastWrittenJson = json
          return
        }

        // A sync write can be rejected by the byte/rate quota (e.g. a large
        // Todo list). Never silently drop data: fall back to device-local so
        // the state survives a reload, and remove the now-stale sync copy so
        // it can't win over the fresher local one on the next load.
        if (resolved === 'sync') {
          const localWritten = await setArea('local', key, env)
          if (localWritten) {
            lastWrittenJson = json
            await removeArea('sync', key)
          }
        }
      }

      // A scheduled write has nobody to reject to: `storage.local` can fail
      // (quota, a closing context), and an unhandled rejection would take the
      // page's error handler by surprise instead of showing up as a log line.
      const logWriteFailure = (err: unknown) => {
        // The name, not the error: a storage failure's message can quote the
        // value it refused, and these envelopes are the user's own data.
        console.error('[sync] write failed', {
          error: err instanceof Error ? err.name : 'unknown',
        })
      }

      const scheduleWrite = () => {
        if (applyingRemote) return

        if (debounceMs <= 0) {
          void writeNow().catch(logWriteFailure)
          return
        }

        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void writeNow().catch(logWriteFailure)
        }, debounceMs)
      }

      const applyEnv = (env: { meta: { rev: number }; state: TPersisted }) => {
        lastRev = env.meta.rev
        lastWrittenJson = JSON.stringify(env.state)
        applyingRemote = true
        set((cur) => merge(cur as unknown as TState, env.state) as Partial<Synced<TState>>)
        applyingRemote = false
      }

      /** What a successful parse of a stored record yields. */
      type ParsedEnv = { meta: { originId: string; rev: number; ts: number }; state: TPersisted }

      /**
       * An envelope that was loaded, together with the record it was parsed
       * from — which is what `wasTransformed` below needs.
       */
      type LoadedEnv = { env: ParsedEnv; raw: unknown }

      const loaded = (env: ParsedEnv | null, raw: unknown): LoadedEnv | null =>
        env ? { env, raw } : null

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
      const loadInitialEnv = async (): Promise<LoadedEnv | null> => {
        if (typeof area === 'function') {
          const [syncRaw, localRaw] = await Promise.all([
            getArea<unknown>('sync', key),
            getArea<unknown>('local', key),
          ])
          const localEnv = parseEnv(localRaw)
          if (localEnv && area(localEnv.state as unknown as TState) === 'local') {
            return { env: localEnv, raw: localRaw }
          }
          const syncEnv = parseEnv(syncRaw)
          return syncEnv ? { env: syncEnv, raw: syncRaw } : loaded(localEnv, localRaw)
        }

        let raw = await getArea<unknown>(area, key)
        if (!raw && area === 'sync') {
          const legacy = await getArea<unknown>('local', key)
          if (legacy) {
            raw = legacy
            await setArea('sync', key, legacy)
          }
        }
        return loaded(parseEnv(raw), raw)
      }

      /**
       * Did the schema *change* the state on its way out — that is, does the
       * store now hold something the bytes on disk do not contain?
       *
       * A schema may upgrade an older persisted shape (the Todo widget's
       * single-board Vikunja config becoming `boards[]`), fill in a default
       * or drop a field it no longer declares. All of that happens on every
       * read, in every context, and stays invisible to anything that reads
       * the record instead of the store — the service worker above all.
       *
       * Compared key-order-insensitively: `z.object` rebuilds its output in
       * schema order, so plain `JSON.stringify` would call a record that
       * merely lists its keys differently "transformed" and rewrite it for
       * nothing.
       */
      const wasTransformed = (raw: unknown, state: TPersisted): boolean => {
        const stored = (raw as { state?: unknown } | null)?.state
        return canonicalJson(stored) !== canonicalJson(state)
      }

      ;(async () => {
        const result = await loadInitialEnv()
        if (!result) return
        applyEnv(result.env)

        // Persist the upgrade once, so the next reader of the record — the
        // worker, another context, this page after a reload — sees what the
        // store sees. `lastWrittenJson` was just set to the parsed slice by
        // `applyEnv`, which is precisely what would skip this write.
        if (!wasTransformed(result.raw, result.env.state)) return
        lastWrittenJson = null
        await writeNow().catch(logWriteFailure)
      })()

      const onChanged = (changes: StorageChanges, changedArea: string) => {
        const ch = changes[key]
        if (!ch?.newValue) return

        const env = parseEnv(ch.newValue)
        if (!env) return
        if (env.meta.originId === ORIGIN_ID) return

        const currentArea = resolveArea()

        // Dynamic-area transition INTO local: a sibling context on THIS device
        // may activate an integration (e.g. connect Trello) and write a `local`
        // envelope. A context still resolving to `sync` would otherwise ignore
        // it, keep showing the pre-integration list, and write it back to sync.
        // Accept the takeover. `local` events are same-device only
        // (storage.local doesn't sync), so this can't be driven remotely; rev
        // spaces differ across contexts, so we don't gate it on rev.
        const incomingArea =
          typeof area === 'function' ? area(env.state as unknown as TState) : currentArea
        if (
          typeof area === 'function' &&
          changedArea === 'local' &&
          incomingArea === 'local' &&
          currentArea !== 'local'
        ) {
          applyEnv(env)
          return
        }

        if (changedArea !== currentArea) return
        if (env.meta.rev <= lastRev) return

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
