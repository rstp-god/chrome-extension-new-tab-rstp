/**
 * What unchecking a board costs, in the words the confirmation shows.
 *
 * Its own module so the boards step stays a component: the counting is a
 * rule about which tasks belong to a board, and the wording is three
 * interpolations — neither is markup.
 *
 * The rule has to agree with the store's `dropTasksOfProject`, which is what
 * actually removes them: a task belongs to a board when it names that project
 * or when its own Vikunja ref was written against it.
 */

import { isVikunjaRef, taskBelongsToBoard } from '@/widgets/Todo/integrations/types.ts'

import type { TodoTask, VikunjaBoard } from '@/widgets/Todo/store/store.ts'

/** A translator, as `useTranslation` hands it over. */
type Translator = (key: string, options?: Record<string, unknown>) => string

export interface BoardRemoval {
  name: string
  /** Tasks the widget would forget. */
  total: number
  /** How many of those never finished a push — the part that is lost for good. */
  pending: number
}

/**
 * One entry per board being dropped, with the two counts the wording needs.
 *
 * Counted with `taskBelongsToBoard`, which is also what the store's
 * `dropTasksOfProject` removes by — so the number the user agrees to is the
 * number that goes.
 */
export function boardRemovals(boards: VikunjaBoard[], tasks: TodoTask[]): BoardRemoval[] {
  return boards.map((board) => {
    const owned = tasks.filter((task) =>
      taskBelongsToBoard(task, String(board.projectId), isVikunjaRef),
    )
    return {
      name: board.name,
      total: owned.length,
      pending: owned.filter((task) => task.syncState !== 'clean').length,
    }
  })
}

/**
 * The confirmation's body: one line per board, plus one more when some of
 * those tasks carry a change that never reached the instance.
 *
 * A list rather than a paragraph — three boards' worth of counts run
 * together is a wall, and the reader is being asked to agree to each of
 * them. The unsent changes get a line of their own because they are the only
 * part of this that is not recoverable: everything else is still in Vikunja
 * and comes back the moment the board is checked again.
 */
export function describeBoardRemoval(removals: BoardRemoval[], t: Translator): string[] {
  const lines = removals.map(({ name, total }) =>
    t('integrations.vikunja.boards.removeBody', { name, count: total }),
  )

  const pending = removals.reduce((sum, removal) => sum + removal.pending, 0)
  if (pending > 0) lines.push(t('integrations.vikunja.boards.removeDirty', { count: pending }))

  return lines
}
