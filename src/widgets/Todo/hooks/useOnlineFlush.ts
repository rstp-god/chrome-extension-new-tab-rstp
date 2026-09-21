import { useEffect } from 'react'

import type { SyncNowOptions } from '@/widgets/Todo/store/store.ts'

/**
 * Flushes whatever piled up while the browser was offline.
 *
 * Nothing is lost without it — a mutation that failed stays `dirty` and the
 * next sync retries it — but "the next sync" could be tomorrow's new tab, and
 * the tab that is open right now can simply notice. `online` is the one event
 * that says the retry is worth making, so it gets a silent sync: the user did
 * not ask for this one, and a spinner appearing on its own would be noise.
 *
 * `enabled` is the caller's whole judgement about whether a sync makes sense
 * (an integration with a scope and a mapping, no terminal error), so the
 * listener is attached only while it does — and a `permissionMissing` banner
 * is never answered by a reconnect that cannot succeed.
 */
export function useOnlineFlush(
  enabled: boolean,
  syncNow: (options?: SyncNowOptions) => Promise<void>,
): void {
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const flush = () => {
      void syncNow({ silent: true })
    }

    window.addEventListener('online', flush)
    return () => {
      window.removeEventListener('online', flush)
    }
  }, [enabled, syncNow])
}
