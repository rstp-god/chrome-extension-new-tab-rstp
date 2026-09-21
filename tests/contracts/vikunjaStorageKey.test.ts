import { describe, expect, it } from 'vitest'

import { VIKUNJA_TODO_STORAGE_KEY } from '@/background/vikunja/constants.ts'
import { TODO_STORAGE_KEY } from '@/widgets/Todo/store/store.ts'

/**
 * The one string the two sides of the bridge both spell out.
 *
 * The worker's background pull has to find the Todo widget's envelope in
 * `chrome.storage.local` by name, and it may not import the widget's store to
 * ask (the boundary rule in `src/background/vikunja/messages.ts`, enforced by
 * `vikunjaBoundary.test.ts`) — so the key is declared twice. A test may
 * import both sides, and this is the only place that does: rename the store's
 * key without the worker's and the background pull would quietly stop
 * scheduling, with nothing failing anywhere near the change.
 */
describe('vikunja background pull ↔ Todo store key', () => {
  it('the worker looks under the key the store writes', () => {
    expect(VIKUNJA_TODO_STORAGE_KEY).toBe(TODO_STORAGE_KEY)
  })
})
