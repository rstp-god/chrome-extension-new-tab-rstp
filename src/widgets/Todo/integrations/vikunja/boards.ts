/**
 * Which of the configured boards a question is about.
 *
 * With one board there was nothing to ask, and the config answered every
 * question about "the board" by itself. With a list there is, and the answer
 * has to be in one place: the helpers here are what the adapter, the wizard
 * and the summary use instead of reaching into `config.boards` each in their
 * own way.
 *
 * "The default board" itself is `defaultVikunjaBoard` in the bridge's shared
 * vocabulary, because the service worker's background pull has to resolve it
 * the same way — a rule the two sides cannot afford to implement twice.
 *
 * Task 3 gives the widget a real board switcher; until then most callers ask
 * about the default one.
 */

import { defaultVikunjaBoard } from '@/background/vikunja/messages.ts'

import type { VikunjaScopePair } from './scope.ts'
import type { VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/**
 * The board new tasks go to: the one `defaultProjectId` names, the first one
 * when it names nothing (or names a board that is no longer in the list), and
 * `null` while the wizard has picked none.
 */
export function defaultBoard(config: VikunjaConfig): VikunjaBoard | null {
  return defaultVikunjaBoard(config)
}

/**
 * The board a project id addresses, or `null` when this config knows nothing
 * about that project.
 *
 * Nothing in the widget calls it yet: today the adapter syncs the default
 * board and reads that one directly. Task 3 is its caller — with every board
 * being synced, a pull and a push resolve their board from the one the
 * operation names (`remoteRef.projectId`, the scope of the view being read),
 * which is exactly this lookup.
 *
 * Deliberately **not** falling back to the default board. The callers are the
 * adapter's read and write paths, and the board carries the mode and the
 * columns the operation is about: answering with another board's would run
 * the op against the wrong rules — flat mode on a kanban board, or a mapping
 * naming buckets that live somewhere else. A scope this config cannot place
 * is an error the caller has to report, not a guess it should make.
 */
export function boardForProject(config: VikunjaConfig, projectId: number): VikunjaBoard | null {
  return config.boards.find((board) => board.projectId === projectId) ?? null
}

/**
 * A copy of the config with `patch` applied to the default board.
 *
 * Returns the config unchanged when there is no board to patch: the callers
 * write per-board state (the wizard's flat-mode flag, the store's cached
 * name/containers/mapping), and inventing a board to hold it would put a
 * scope in the config the user never picked.
 */
export function withDefaultBoardPatch(
  config: VikunjaConfig,
  patch: Partial<VikunjaBoard>,
): VikunjaConfig {
  const board = defaultBoard(config)
  if (!board) return config

  return {
    ...config,
    boards: config.boards.map((current) =>
      current.projectId === board.projectId ? { ...current, ...patch } : current,
    ),
  }
}

/**
 * Every board this connection syncs, as the pairs Vikunja addresses a task
 * list by.
 *
 * The broadcast subscriber's question: the worker pulls one view per alarm,
 * and a page has to accept a broadcast about **any** board it is showing
 * rather than only about the default one. The ids are already numbers here
 * (the persisted schema insists on positive integers), so nothing can be
 * unaddressable — an empty list means no board has been picked.
 */
export function boardScopes(config: VikunjaConfig): VikunjaScopePair[] {
  return config.boards.map((board) => ({ projectId: board.projectId, viewId: board.viewId }))
}

/**
 * Is there a board whose mapping wizard was never finished?
 *
 * What "this connection is waiting on the mapping step" means with a list of
 * boards: one unmapped board is enough, and it need not be the default one —
 * a sync that ran anyway would have no way to place that board's tasks.
 */
export function hasUnmappedBoard(config: VikunjaConfig): boolean {
  return config.boards.some((board) => board.mapping === null)
}
