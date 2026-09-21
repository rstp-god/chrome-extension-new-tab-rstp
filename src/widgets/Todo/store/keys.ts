/**
 * The Todo widget's `chrome.storage` keys, and nothing else.
 *
 * A module with no imports on purpose: the keys are needed by code that
 * cannot afford to pull the store in — the Playwright scenarios seed an
 * envelope from the page, and importing `store.ts` there would drag along the
 * integration registry, which is built with `import.meta.glob` (Vite-only).
 * The store re-exports both names, so nothing else has to know this file
 * exists.
 */

/** Envelope of tasks + the active integration, written by `withChromeSync`. */
export const TODO_STORAGE_KEY = 'todo-widget:v1'

/**
 * Where the pre-disconnect copy of the task list lands (see
 * `todoHandoverSchema`). A key of its own, not a field of the envelope above:
 * it is written by hand, read by nobody at runtime, and has to survive the
 * envelope being deleted — which is exactly what a disconnect does.
 */
export const TODO_HANDOVER_KEY = 'todo-widget:handover:v1'
