/**
 * Which of the configured boards a question is about.
 *
 * With one board there was nothing to ask, and the config answered every
 * question about "the board" by itself. With a list there is, and the answer
 * has to be in one place: the helpers here are what the adapter, the wizard
 * and the summary use instead of reaching into `config.boards` each in their
 * own way.
 *
 * Task 3 gives the widget a real board switcher; until then "the board" means
 * the default one.
 */

import type { VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/**
 * The board new tasks go to: the one `defaultProjectId` names, the first one
 * when it names nothing (or names a board that is no longer in the list), and
 * `null` while the wizard has picked none.
 */
export function defaultBoard(config: VikunjaConfig): VikunjaBoard | null {
  const [first] = config.boards
  if (first === undefined) return null
  if (config.defaultProjectId === null) return first

  return config.boards.find((board) => board.projectId === config.defaultProjectId) ?? first
}

/**
 * The board a project id addresses.
 *
 * Falls back to the default board rather than to `null`, because the callers
 * are the adapter's own paths: they are given a scope the descriptor derived
 * from this very config, and a page caught mid-reconfigure must keep behaving
 * the way it did when there was one board instead of quietly switching to
 * flat mode because no board matched.
 */
export function boardForProject(config: VikunjaConfig, projectId: number): VikunjaBoard | null {
  return config.boards.find((board) => board.projectId === projectId) ?? defaultBoard(config)
}

/**
 * A copy of the config with `patch` applied to the default board.
 *
 * Returns the config unchanged when there is no board to patch: the callers
 * write a per-board setting (the wizard's flat-mode flag), and inventing a
 * board to hold it would put a scope in the config the user never picked.
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
