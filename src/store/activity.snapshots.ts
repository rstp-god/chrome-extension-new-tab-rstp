import { create } from 'zustand/react'
import type { z } from 'zod'

import { ACTIVITY_KEYS, type ActivityStorageKey } from '@/background/activity/constants.ts'
import type {
  ActivityAllSnapshot,
  ActivityDaySnapshot,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'
import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import type { Synced } from '@/services/chrome/zustandChromeSync.ts'
import {
  activityAllEnvelope,
  activityDayEnvelope,
  activityWeekEnvelope,
} from '@/services/zod/activitySchemas.ts'
import type { Envelope } from '@/services/zod/zodEnvelop.ts'

/**
 * Read-only Zustand stores for the three pre-aggregated snapshots.
 *
 * The background worker writes; the UI only reads. `withChromeSync` is
 * configured with `autoPersist: false` — no subscribe-and-write — but the
 * wrapper still attaches `commit` to the public surface. We shadow it with
 * a no-op below so a stray `useActivityDayStore.getState().commit()` can't
 * clobber the worker's snapshot with an in-memory null.
 *
 * Widgets pick one of `useActivityDayStore` / `useActivityWeekStore` /
 * `useActivityAllStore` based on the period — each subscription targets a
 * single storage key so changing one snapshot doesn't rerender the others.
 */

interface SnapshotStore<T> {
  snapshot: T | null
}

function makeReadOnlySnapshotStore<T>(key: ActivityStorageKey, schema: z.ZodType<Envelope<T>>) {
  const store = create<Synced<SnapshotStore<T>>>()(
    withChromeSync<SnapshotStore<T>, T>({
      key,
      schema,
      // Defence in depth: commit is shadowed below so this function should
      // be unreachable. If something ever flips autoPersist or forces a write,
      // we throw rather than quietly persisting a `null` snapshot.
      partialize: () => {
        throw new Error(`[activity] snapshot store "${key}" is read-only`)
      },
      merge: (_cur, incoming) => ({ snapshot: incoming }),
      autoPersist: false,
    })(() => ({
      snapshot: null,
    })),
  )

  // Override the `commit` that `withChromeSync` unconditionally attaches.
  // Zustand's `setState` is a shallow merge, so this replaces just the
  // function while leaving `snapshot` alone. Runs synchronously after
  // `create`, before any subscriber can see the leaked `commit`.
  store.setState({
    commit: async () => {
      console.warn(`[activity] snapshot store "${key}" is read-only; commit() ignored`)
    },
  } as Partial<Synced<SnapshotStore<T>>>)

  return store
}

export const useActivityDayStore = makeReadOnlySnapshotStore<ActivityDaySnapshot>(
  ACTIVITY_KEYS.day,
  activityDayEnvelope,
)

export const useActivityWeekStore = makeReadOnlySnapshotStore<ActivityWeekSnapshot>(
  ACTIVITY_KEYS.week,
  activityWeekEnvelope,
)

export const useActivityAllStore = makeReadOnlySnapshotStore<ActivityAllSnapshot>(
  ACTIVITY_KEYS.all,
  activityAllEnvelope,
)
