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
 * vocabulary, where the persisted config's schema lives: what
 * `defaultProjectId` means is part of that config, not of this widget.
 *
 * Who asks what: the adapter's read and write paths ask about every board (a
 * pull reads each one, a push resolves the board of the task it is given);
 * the wizard walks the boards it has to map; the summary lists them all and
 * asks for the default one only to star it. The store asks for it when it has
 * per-scope state to cache and knows only "the board the UI is about".
 */

import { defaultVikunjaBoard } from '@/background/vikunja/messages.ts'

import { getVikunjaBoardPillClass } from './projectStyles.ts'

import type { VikunjaScopePair } from './scope.ts'
import type { Project } from '@/widgets/Todo/integrations/types.ts'
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
 * A board as the widget's project: the project id it is addressed by, the
 * title cached when it was picked, and a pill colour derived from that id
 * (a Vikunja project carries no colour of its own).
 *
 * Two callers, and they are the reason it lives here rather than next to
 * `listProjects`: the adapter answers `listProjects` with it, and the
 * legacy-state upgrade rebuilds `integration.projects` with it — the cache
 * the pills and the add dialog read. Under the single-board model those
 * entries were the instance's *labels*, so an upgrade that left them alone
 * would offer the user choices that name nothing (see `upgradePersistedState`).
 * One helper, so the cache the upgrade writes cannot drift from the one the
 * next sync writes.
 *
 * Takes only the two fields it reads, so a caller holding a board that is not
 * yet a parsed `VikunjaBoard` — the upgrade builds one field by field — can
 * use it without a cast.
 */
export function boardToProject(board: Pick<VikunjaBoard, 'projectId' | 'name'>): Project {
  return {
    id: String(board.projectId),
    name: board.name,
    pillClassName: getVikunjaBoardPillClass(board.projectId),
  }
}

/**
 * The board a project id addresses, or `null` when this config knows nothing
 * about that project.
 *
 * The adapter's push is its caller: with every board being synced, a write
 * resolves its board from the one the task names — `remoteRef.projectId` for
 * a task that already exists, `task.projectId` for one being created.
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
 * A copy of the config with `patch` applied to the board `projectId` names.
 *
 * Returns the config unchanged when no board answers to that id: the callers
 * write per-board state (the wizard's mapping and flat-mode flag, the buckets
 * it re-read after creating a column), and inventing a board to hold it would
 * put a scope in the config the user never picked.
 *
 * The wizard is the caller that needs this rather than
 * `withDefaultBoardPatch`: with several boards it walks them one at a time,
 * and the board it is on is usually not the default one.
 */
export function withBoardPatch(
  config: VikunjaConfig,
  projectId: number,
  patch: Partial<VikunjaBoard>,
): VikunjaConfig {
  if (!config.boards.some((board) => board.projectId === projectId)) return config

  return {
    ...config,
    boards: config.boards.map((current) =>
      current.projectId === projectId ? { ...current, ...patch } : current,
    ),
  }
}

/**
 * A copy of the config with `patch` applied to the default board.
 *
 * Returns the config unchanged when there is no board to patch, for the same
 * reason as `withBoardPatch` — which is also where the writing happens; this
 * is the store's entry point (`withBoardState`), which knows only "the board
 * the settings UI is about".
 */
export function withDefaultBoardPatch(
  config: VikunjaConfig,
  patch: Partial<VikunjaBoard>,
): VikunjaConfig {
  const board = defaultBoard(config)
  if (!board) return config

  return withBoardPatch(config, board.projectId, patch)
}

/**
 * Every board this connection syncs, as the pairs Vikunja addresses a task
 * list by.
 *
 * The broadcast subscriber's question: one alarm tick reads every connected
 * view and announces itself once, naming one of them, so a page has to accept
 * a broadcast about **any** board it is showing rather than only about the
 * default one. The ids are already numbers here (the persisted schema insists
 * on positive integers), so nothing can be unaddressable — an empty list
 * means no board has been picked.
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
