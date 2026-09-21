/**
 * The arithmetic behind the bucket-mapping wizard: guess a mapping from the
 * column names, tell the user what is wrong with the one they have, and build
 * the fallback for a board that cannot be mapped at all.
 *
 * Pure on purpose — no store, no i18n, no React — so the rules can be read
 * and tested as rules.
 */

import { TODO_STATUSES } from '@/widgets/Todo/integrations/types.ts'

import type {
  RemoteContainer,
  StatusListMapping,
  TodoStatus,
} from '@/widgets/Todo/integrations/types.ts'

/**
 * Patterns that give a status away, in both languages the extension ships.
 * Tested case-insensitively against the trimmed column name.
 *
 * Not plain substrings: `Binder` must not read as the trash and `Newsletter`
 * must not read as the inbox, so the short English words are word-bounded
 * (`\bbin\b`, `\bnew\b`, `\bwip\b`). Russian is matched by stem instead —
 * `удал` covers «удалено», «Удаленные» and «удалённые», where a word boundary
 * would have to enumerate the endings. Longer English words stay
 * substring-ish on purpose, so "To-Do (new)" and "Doing 🚧" still match.
 *
 * `completed` is absent on purpose — it is never matched by name. Vikunja's
 * own done bucket is the only column that flips `done` server-side, so it is
 * the only honest home for `completed`, whatever it happens to be called.
 */
const NAME_HINTS: Record<Exclude<TodoStatus, 'completed'>, readonly RegExp[]> = {
  input: [/todo/, /to-do/, /to do/, /backlog/, /inbox/, /\bnew\b/, /входящ/, /б[еэ]клог/, /нов/],
  inprogress: [/doing/, /in[ -]progress/, /\bwip\b/, /в работе/, /дела/, /процесс/],
  struggle: [/struggle/, /stuck/, /blocked/, /затык/, /застря/, /блок/],
  deleted: [/trash/, /\bbin\b/, /delete/, /корзин/, /удал/],
}

function emptyMapping(): StatusListMapping {
  return { input: [], inprogress: [], struggle: [], completed: [], deleted: [] }
}

function matchesHint(name: string, status: Exclude<TodoStatus, 'completed'>): boolean {
  const normalized = name.trim().toLowerCase()
  return NAME_HINTS[status].some((hint) => hint.test(normalized))
}

/** The view's own done bucket, if the scope has one. */
export function terminalContainer(containers: RemoteContainer[]): RemoteContainer | null {
  return containers.find((container) => container.isTerminal) ?? null
}

/**
 * A first draft of the mapping, from the column names alone.
 *
 * Rules, in the order they matter:
 *
 * 1. the terminal (done) bucket is `completed`, always, and nothing else is;
 * 2. every other column goes to the first status in `TODO_STATUSES` order
 *    whose hints it matches, and to that status only — a column mapped twice
 *    is a conflict, and a *suggestion* that starts out in conflict is worse
 *    than a suggestion that leaves a row empty;
 * 3. a column nothing matched is left out, and a status nothing matched keeps
 *    an empty row for the user (or the "create the missing columns" panel) to
 *    fill.
 */
export function suggestMapping(containers: RemoteContainer[]): StatusListMapping {
  const draft = emptyMapping()
  const terminal = terminalContainer(containers)
  if (terminal) draft.completed = [terminal.id]

  for (const container of containers) {
    if (terminal && container.id === terminal.id) continue

    for (const status of TODO_STATUSES) {
      if (status === 'completed') continue
      if (!matchesHint(container.name, status)) continue
      draft[status].push(container.id)
      break
    }
  }

  return draft
}

export interface MappingProblems {
  /** Groups of statuses that were handed the same container. */
  conflicts: TodoStatus[][]
  /**
   * Every status other than `completed` that was handed the done bucket.
   * Moving a task into that bucket sets `done` server-side (recon Q7/Q8), so
   * "in progress" or "deleted" tasks pushed there come straight back as
   * finished — wrong for all of them, not just for the trash.
   */
  terminalMisused: TodoStatus[]
  /** `completed` does not push to the done bucket. */
  completedNotTerminal: boolean
  /** Statuses with no container at all; the mapping cannot be saved. */
  missing: TodoStatus[]
}

/**
 * Everything the wizard needs to say about a draft.
 *
 * `completedNotTerminal` is a warning rather than an error: it is a legitimate
 * (if painful) choice on a board whose done bucket is used for something else.
 * The hard errors are a conflict, an empty row and a misused done bucket —
 * the first makes the pull ambiguous, the second cannot be persisted at all,
 * and the third would have Vikunja finish tasks behind the user's back.
 */
export function validateMapping(
  draft: StatusListMapping,
  containers: RemoteContainer[],
): MappingProblems {
  const owners = new Map<string, TodoStatus[]>()
  for (const status of TODO_STATUSES) {
    for (const id of draft[status]) {
      const known = owners.get(id)
      if (known) {
        if (!known.includes(status)) known.push(status)
      } else {
        owners.set(id, [status])
      }
    }
  }

  const terminal = terminalContainer(containers)

  return {
    conflicts: [...owners.values()].filter((statuses) => statuses.length > 1),
    terminalMisused:
      terminal === null
        ? []
        : TODO_STATUSES.filter(
            (status) => status !== 'completed' && draft[status].includes(terminal.id),
          ),
    completedNotTerminal: terminal !== null && draft.completed[0] !== terminal.id,
    missing: TODO_STATUSES.filter((status) => draft[status].length === 0),
  }
}

/**
 * The fallback for a board the user does not want to rebuild: every
 * non-terminal status points at the view's default bucket — the one Vikunja
 * itself drops a new task into, and where a task leaving the done bucket
 * lands (recon Q8) — while `completed` points at the done bucket.
 *
 * It is a real `StatusListMapping` (the persisted schema needs every row
 * filled), but in flat mode the adapter writes to no bucket other than the
 * terminal one — `kanbanMapping: false` is what task 6 reads to know that.
 * `input` / `inprogress` / `struggle` / `deleted` are then local-only
 * statuses that survive in the widget's own store, and only "done" crosses to
 * Vikunja.
 *
 * `null` when the view has no done bucket: without one nothing at all could
 * round-trip, and a mapping that syncs nothing would be a lie.
 */
export function flatModeMapping(containers: RemoteContainer[]): StatusListMapping | null {
  const terminal = terminalContainer(containers)
  if (!terminal) return null

  // The view's own `default_bucket_id` when the adapter reported it;
  // otherwise the leftmost non-terminal column, which is what Vikunja's
  // default is in practice.
  const fallback =
    containers.find((container) => container.isDefault && !container.isTerminal) ??
    containers.find((container) => !container.isTerminal) ??
    terminal

  return {
    input: [fallback.id],
    inprogress: [fallback.id],
    struggle: [fallback.id],
    completed: [terminal.id],
    deleted: [fallback.id],
  }
}
