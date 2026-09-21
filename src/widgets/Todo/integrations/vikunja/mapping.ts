/**
 * Vikunja record ↔ `TodoTask`.
 *
 * Unlike the Trello adapter this one stores **no hidden metadata** anywhere
 * on the remote (recon §2.11): Vikunja's web editor is TipTap, which strips
 * HTML comments out of a description the moment the user edits it, and a
 * machine comment on every task is litter in someone else's tracker. Nothing
 * is lost by it — everything Trello hides in `desc` either exists natively
 * here (`created`, `done_at`) or follows from the task id.
 */

import {
  isReservedVikunjaLabel,
  normalizeVikunjaTimestamp,
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'
import { statusForContainerId } from '@/widgets/Todo/integrations/statusMapping.ts'

import { getVikunjaProjectPillClass } from './projectStyles.ts'

import type { VikunjaLabelSummary, VikunjaPulledTask } from '@/background/vikunja/messages.ts'
import type { Project, StatusListMapping, TodoStatus } from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

/** Statuses flat mode keeps locally because Vikunja has nowhere to put them. */
const LOCAL_ONLY_STATUSES: readonly TodoStatus[] = ['inprogress', 'struggle', 'deleted']

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const ENTITY_RE = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g

/**
 * One pass, on purpose: decoding `&amp;` in a separate pass would turn
 * `&amp;lt;` — a user who literally typed `&lt;` — into `<`.
 */
function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match, body: string) => {
    if (!body.startsWith('#')) {
      return NAMED_ENTITIES[body.toLowerCase()] ?? match
    }

    const hex = body[1] === 'x' || body[1] === 'X'
    const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
    // Out of range or a lone surrogate: `String.fromCodePoint` would throw,
    // and a description must never be able to crash a pull.
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return match
    if (code >= 0xd800 && code <= 0xdfff) return match
    return String.fromCodePoint(code)
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * A `<script>` or `<style>` element, contents and all.
 *
 * Their text is code, not prose: stripping only the tags would leave the
 * whole stylesheet sitting in the task's description. Nothing legitimate puts
 * either in a Vikunja description, but a shared project is enough for someone
 * else to try.
 */
const CODE_BLOCK_RE = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi

/**
 * Any tag, tolerating a `>` inside a quoted attribute — `<img alt="a > b">`
 * is one tag, and a naive `/<[^>]*>/` would cut it in half and spill
 * `b">` into the text.
 */
const TAG_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*>/g

/**
 * Vikunja's rich-text description → the plain text the widget shows.
 *
 * Regex-based rather than DOM-based because this runs in the widget *and*
 * would have to keep working anywhere `DOMParser` is absent (a worker, a
 * node test). It is a formatter, not a sanitiser: the result is rendered as
 * text, never as markup.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/\r\n?/g, '\n')
    .replace(CODE_BLOCK_RE, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')

  // Tags first, entities second: an escaped `&lt;b&gt;` the user typed must
  // survive as text instead of being decoded into a tag and then stripped.
  const stripped = withBreaks.replace(TAG_RE, '')

  return decodeEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The inverse, used by every push: blank-line-separated paragraphs, single
 * newlines as `<br>`, everything else escaped.
 */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * A prefix of `text` that never ends in half of a surrogate pair.
 *
 * Cutting between the two halves of an emoji leaves a lone surrogate, which
 * `JSON.stringify` happily encodes and the instance then stores as a broken
 * character — so the last code unit goes too when it is a leading surrogate.
 */
function slicePreservingCodePoints(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * The description as HTML, shortened until the **HTML** fits the API ceiling.
 *
 * The plain text cannot simply be cut to the limit: escaping expands it (one
 * `&` becomes five characters) and `textToHtml` adds a `<p>` per paragraph, so
 * a text that measures under the ceiling can produce markup well over it. Nor
 * can the HTML be cut instead — that would end a payload mid-entity or
 * mid-tag. So the *text* is shortened and re-rendered, and the largest prefix
 * that fits is found by bisection (the rendered length never shrinks as the
 * prefix grows, which is what makes that valid).
 */
function clampDescriptionHtml(text: string): string {
  const full = textToHtml(text)
  if (full.length <= VIKUNJA_MAX_DESCRIPTION_LENGTH) return full

  // `low` is always a length that fits (the empty prefix renders to '').
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const fits =
      textToHtml(slicePreservingCodePoints(text, mid)).length <= VIKUNJA_MAX_DESCRIPTION_LENGTH
    if (fits) low = mid
    else high = mid - 1
  }

  return textToHtml(slicePreservingCodePoints(text, low))
}

/**
 * The two free-text fields of a payload, bounded before they leave the widget.
 *
 * The worker refuses an over-long title or description (its Zod schemas are
 * the last line, and rightly so), but a refusal there surfaces to the user as
 * `unknown` on a task they cannot fix — they never typed a limit. Clamping at
 * the sender means a pathological paste still syncs, just shortened.
 *
 * `title` is trimmed to the raw character ceiling; the description is measured
 * as the HTML it will become. Both are the shared ceilings from `messages.ts`,
 * so the two sides cannot disagree about what "too long" means.
 */
export function clampForVikunja(
  title: string,
  descriptionText: string,
): { title: string; description: string } {
  return {
    title: slicePreservingCodePoints(title, VIKUNJA_MAX_TITLE_LENGTH),
    description: clampDescriptionHtml(descriptionText),
  }
}

/**
 * Local id of a task we are meeting for the first time.
 *
 * Derived rather than random: Vikunja's numeric task id is globally unique
 * and stable, so the same remote task produces the same local id on every
 * device, and no hidden metadata is needed to recognise it again.
 */
export function localIdForTask(taskId: number): string {
  return `vikunja:${taskId}`
}

/**
 * Is this one of the labels another feature owns?
 *
 * Re-exported under the adapter's own name from the shared list in
 * `messages.ts`: the worker enforces the very same rule when it removes
 * labels, and two copies of a "never touch these" list is how one of them
 * ends up out of date.
 */
export function isReservedLabel(title: string): boolean {
  return isReservedVikunjaLabel(title)
}

export function labelToProject(label: VikunjaLabelSummary): Project {
  return {
    id: String(label.id),
    name: label.title,
    pillClassName: getVikunjaProjectPillClass(label.hexColor),
  }
}

export interface VikunjaTaskContext {
  /**
   * The mapping of the board being pulled, or `null` when that board has
   * none — which is flat mode, where the status comes from `done` and this is
   * never read. A kanban board without a mapping is refused by the adapter
   * before a pull reaches here.
   */
  mapping: StatusListMapping | null
  /**
   * Local task id per known Vikunja task id, built once by the adapter. An
   * index rather than the raw `knownRefs` record, so mapping a board stays
   * linear in the number of tasks.
   */
  localIdByTaskId: Map<number, string>
  knownStatuses: Record<string, TodoStatus>
  /** `true` when the user declined the bucket mapping — see `flatModeMapping`. */
  flat: boolean
  /** Label ids (as strings) that may act as a project. */
  projectIds: Set<string>
  /**
   * The board being pulled, as its Vikunja project id. It is what every ref
   * built here records: a task that does not say which board it lives on
   * cannot be found again once more than one is connected.
   *
   * Deliberately not called `projectId` — in this file that word is already
   * the widget's own notion of a project (a Vikunja *label*), and the two
   * mean different things on the same task.
   */
  boardProjectId: number
}

/** `Date.parse` that cannot produce NaN — the persisted schema rejects one. */
function parseTimestamp(iso: string | null, fallback: number): number {
  if (iso === null) return fallback
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Status of a pulled task.
 *
 * Kanban mode reads it off the bucket. Flat mode has only `done` to go on, so
 * it keeps whatever intermediate status the local store remembers and treats
 * everything else as incoming — that is the whole deal the user accepts when
 * they skip the bucket mapping.
 */
function statusFor(task: VikunjaPulledTask, localId: string, ctx: VikunjaTaskContext): TodoStatus {
  // A kanban board with no mapping does not reach here (the adapter refuses
  // it); `input` is the fallback an unmapped bucket gets anyway.
  if (!ctx.flat) {
    return ctx.mapping === null ? 'input' : statusForContainerId(String(task.bucketId), ctx.mapping)
  }
  if (task.done) return 'completed'

  const known = ctx.knownStatuses[localId]
  return known !== undefined && LOCAL_ONLY_STATUSES.includes(known) ? known : 'input'
}

export function vikunjaTaskToTodo(task: VikunjaPulledTask, ctx: VikunjaTaskContext): TodoTask {
  // The index is keyed by the remote id rather than the derived local one:
  // that is what keeps a task linked after it was created locally, born with
  // a random uuid and only later told its `taskId`.
  const id = ctx.localIdByTaskId.get(task.id) ?? localIdForTask(task.id)
  const status = statusFor(task, id, ctx)

  const description = htmlToText(task.description)
  const updatedAt = parseTimestamp(task.updated, Date.now())
  // `done_at` is filled on 2.6 (recon Q7) but trap 6 says other versions may
  // leave it empty, so `updated` stands in rather than a null completion date
  // on a task the user can see is done.
  const completedAt = task.done ? parseTimestamp(task.doneAt ?? task.updated, updatedAt) : null

  return {
    id,
    title: task.title,
    description: description.length > 0 ? description : null,
    status,
    projectId: task.labelIds.map(String).find((labelId) => ctx.projectIds.has(labelId)) ?? null,
    createdAt: parseTimestamp(task.created, updatedAt),
    statusChangedAt: completedAt ?? updatedAt,
    completedAt,
    deletedAt: status === 'deleted' ? updatedAt : null,
    // Purely local: Vikunja has no field for "the tab this task came from".
    linkedTab: null,
    remoteRef: {
      taskId: task.id,
      projectId: ctx.boardProjectId,
      identifier: task.identifier,
      // `0` is Vikunja's "no bucket" sentinel, which flat mode leaves behind.
      bucketId: task.bucketId || null,
      updated: normalizeVikunjaTimestamp(task.updated),
    },
    syncState: 'clean',
  }
}
