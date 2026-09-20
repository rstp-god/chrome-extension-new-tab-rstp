/**
 * Zod schemas for everything Vikunja sends back.
 *
 * Built from `docs/vikunja-recon.md` — real responses of a Vikunja 2.6.0
 * instance — rather than from the OpenAPI document, because the two disagree
 * on exactly the details that break a parser: unset dates arrive as
 * `0001-01-01T00:00:00Z` instead of `null`, and the four collection fields of
 * a task arrive as `null` instead of `[]`.
 */

import { z } from 'zod'

/**
 * Go's zero `time.Time` as Vikunja serialises it. Any timestamp in year 1 is
 * "unset", whatever offset it carries.
 */
const ZERO_DATE_RE = /^0001-01-01T/

/**
 * An optional timestamp: the zero date and a missing key both collapse to
 * `null`, so callers get one "no value" instead of three.
 *
 * Not used for `created` / `updated`, which are always real and where
 * `updated` doubles as the etag — those stay plain strings.
 */
export const vikunjaDateSchema = z.preprocess((value) => {
  if (value === undefined) return null
  if (typeof value === 'string' && ZERO_DATE_RE.test(value)) return null
  return value
}, z.string().nullable())

/**
 * A collection Vikunja may send as `null` (recon Q13/Q21: a task without
 * labels carries `labels: null`, not `[]`) or omit entirely. Normalised to an
 * array so no consumer has to null-check a list.
 */
function nullableArray<T extends z.ZodType>(item: T) {
  return z
    .array(item)
    .nullish()
    .transform((value) => value ?? [])
}

/**
 * `GET /info`. Only the fields we act on: `version` is shown on the connect
 * screen and gates the "tested with 2.6" warning, `max_items_per_page` sizes
 * the paged pull (task 5), `task_comments_enabled` decides where hidden
 * metadata can live if the web editor eats HTML comments (recon Q20).
 * The last two are optional — an older instance may not report them, and a
 * missing field must not cost the user a connection.
 */
export const vikunjaInfoSchema = z.object({
  version: z.string(),
  max_items_per_page: z.number().optional(),
  task_comments_enabled: z.boolean().optional(),
})

/**
 * A user, as `GET /user` returns it and as tasks embed it in `assignees`.
 * Loose for the same reason as the task below: an embedded assignee survives
 * a read-modify-write intact.
 */
export const vikunjaUserSchema = z.looseObject({
  id: z.number(),
  username: z.string(),
  name: z.string(),
})

/** `GET /labels`, and the entries of a task's `labels`. */
export const vikunjaLabelSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  hex_color: z.string(),
})

/**
 * A project view. `done_bucket_id` / `default_bucket_id` are `0` on non-kanban
 * views (recon Q5) — `0` is the sentinel, not a bucket id.
 */
export const vikunjaViewSchema = z.object({
  id: z.number(),
  title: z.string(),
  view_kind: z.string(),
  done_bucket_id: z.number(),
  default_bucket_id: z.number(),
})

/**
 * `GET /projects`. `views` comes embedded (recon Q5/§2.7), so finding the
 * kanban view costs no extra request. Treated as a nullable collection like
 * every other array on this API.
 */
export const vikunjaProjectSchema = z.object({
  id: z.number(),
  title: z.string(),
  identifier: z.string(),
  is_archived: z.boolean(),
  views: nullableArray(vikunjaViewSchema),
})

/** A kanban bucket. `limit: 0` means "no WIP limit". */
export const vikunjaBucketSchema = z.object({
  id: z.number(),
  title: z.string(),
  project_view_id: z.number(),
  position: z.number(),
  limit: z.number(),
})

/**
 * A task.
 *
 * **Loose on purpose.** `POST /tasks/:id` is a full replace — a partial body
 * blanks every field left out (recon Q9) — so task 6 has to read, modify and
 * write back the whole record. A stripping schema would silently drop every
 * field this file does not model (`reactions`, `subscription`, `cover_*`,
 * anything a future Vikunja adds) and the first edit would wipe them from the
 * user's instance. Unknown keys therefore ride through untouched.
 *
 * `related_tasks` is `null` or an object keyed by relation kind (recon Q21);
 * we never read inside it, only carry it, so it stays `unknown`.
 */
export const vikunjaTaskSchema = z.looseObject({
  id: z.number(),
  identifier: z.string(),
  index: z.number(),
  project_id: z.number(),
  /** `0` outside a view response — the global task list does not fill it (recon Q3). */
  bucket_id: z.number(),
  title: z.string(),
  description: z.string(),
  done: z.boolean(),
  done_at: vikunjaDateSchema,
  due_date: vikunjaDateSchema,
  start_date: vikunjaDateSchema,
  end_date: vikunjaDateSchema,
  priority: z.number(),
  percent_done: z.number(),
  created: z.string(),
  /** Cheap etag. Normalise to whole seconds before comparing (recon §2.3). */
  updated: z.string(),
  labels: nullableArray(vikunjaLabelSchema),
  assignees: nullableArray(vikunjaUserSchema),
  reminders: nullableArray(z.unknown()),
  repeat_after: z.number(),
  repeat_mode: z.number(),
  hex_color: z.string(),
  position: z.number(),
  is_favorite: z.boolean(),
  related_tasks: z.unknown().nullable(),
  attachments: nullableArray(z.unknown()),
  cover_image_attachment_id: z.number(),
})

/**
 * One entry of `GET /projects/:pid/views/:vid/tasks` on a kanban view: the
 * bucket itself with its tasks nested (recon Q2) — not the flat task list the
 * spec assumed. `tasks` is **absent** for an empty bucket, hence optional
 * rather than nullable-with-default.
 */
export const vikunjaBucketWithTasksSchema = vikunjaBucketSchema.extend({
  tasks: z.array(vikunjaTaskSchema).optional(),
})

/**
 * Answer to `POST /projects/:pid/views/:vid/buckets/:bid/tasks` — the only
 * working form of the move (recon Q4). The embedded `task` is authoritative
 * for `done` / `done_at`, so a move needs no follow-up GET.
 */
export const vikunjaTaskBucketSchema = z.object({
  task_id: z.number(),
  bucket_id: z.number(),
  project_view_id: z.number(),
  task: vikunjaTaskSchema,
})

export type VikunjaInfo = z.infer<typeof vikunjaInfoSchema>
export type VikunjaUser = z.infer<typeof vikunjaUserSchema>
export type VikunjaLabel = z.infer<typeof vikunjaLabelSchema>
export type VikunjaView = z.infer<typeof vikunjaViewSchema>
export type VikunjaProject = z.infer<typeof vikunjaProjectSchema>
export type VikunjaBucket = z.infer<typeof vikunjaBucketSchema>
export type VikunjaTask = z.infer<typeof vikunjaTaskSchema>
export type VikunjaBucketWithTasks = z.infer<typeof vikunjaBucketWithTasksSchema>
export type VikunjaTaskBucket = z.infer<typeof vikunjaTaskBucketSchema>
