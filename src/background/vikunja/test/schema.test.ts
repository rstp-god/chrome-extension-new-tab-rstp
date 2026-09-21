import { describe, expect, it } from 'vitest'

import {
  vikunjaBucketSchema,
  vikunjaBucketWithTasksSchema,
  vikunjaInfoSchema,
  vikunjaLabelSchema,
  vikunjaProjectSchema,
  vikunjaTaskBucketSchema,
  vikunjaTaskSchema,
  vikunjaUserSchema,
  vikunjaViewSchema,
} from '@/background/vikunja/schema.ts'

/**
 * Every fixture below is a fragment of a real Vikunja 2.6.0 response, copied
 * from `docs/vikunja-recon.md`. The point of this file is that the traps
 * recorded there — zero dates instead of `null`, `null` instead of `[]`, a
 * missing `tasks` key — stay handled if anyone touches the schemas.
 */

const ZERO_DATE = '0001-01-01T00:00:00Z'

/** Probe task id 4 of project `Inbox`, as the view endpoint returns it. */
const RAW_TASK = {
  id: 4,
  title: '[newtab-probe] renamed',
  description: '<p>rich description</p><!-- newtab-todo:v1 {"a":1} -->',
  done: false,
  done_at: ZERO_DATE,
  due_date: ZERO_DATE,
  start_date: ZERO_DATE,
  end_date: ZERO_DATE,
  repeat_after: 0,
  repeat_mode: 0,
  priority: 0,
  labels: null,
  assignees: [],
  hex_color: '',
  percent_done: 0,
  identifier: '#3',
  index: 3,
  related_tasks: null,
  attachments: null,
  reminders: null,
  cover_image_attachment_id: 0,
  is_favorite: false,
  created: '2026-09-20T17:57:12+03:00',
  updated: '2026-09-20T17:57:12+03:00',
  bucket_id: 1,
  position: 100,
  project_id: 1,
}

function parseTask(patch: Record<string, unknown> = {}) {
  const parsed = vikunjaTaskSchema.safeParse({ ...RAW_TASK, ...patch })
  expect(parsed.error).toBeUndefined()
  if (!parsed.success) throw new Error('unreachable')
  return parsed.data
}

describe('vikunjaTaskSchema dates', () => {
  it('normalises every zero date to null (recon Q1)', () => {
    const task = parseTask()

    expect(task.done_at).toBeNull()
    expect(task.due_date).toBeNull()
    expect(task.start_date).toBeNull()
    expect(task.end_date).toBeNull()
  })

  it('keeps a real date verbatim', () => {
    const task = parseTask({
      due_date: '2026-12-31T12:00:00Z',
      done: true,
      done_at: '2026-09-20T17:57:28+03:00',
    })

    expect(task.due_date).toBe('2026-12-31T12:00:00Z')
    expect(task.done_at).toBe('2026-09-20T17:57:28+03:00')
  })

  it('treats a zero date in any offset as unset', () => {
    expect(parseTask({ due_date: '0001-01-01T00:00:00+03:00' }).due_date).toBeNull()
  })

  it('treats any sentinel older than 1900 as unset, not just year 1', () => {
    expect(parseTask({ due_date: '1754-08-30T00:00:00Z' }).due_date).toBeNull()
    expect(parseTask({ due_date: '1899-12-31T23:59:59Z' }).due_date).toBeNull()
    expect(parseTask({ due_date: '1900-01-01T00:00:00Z' }).due_date).toBe('1900-01-01T00:00:00Z')
  })

  it('leaves an unparseable string visible rather than calling it unset', () => {
    expect(parseTask({ due_date: 'not a date' }).due_date).toBe('not a date')
  })

  it('leaves created/updated as plain strings — updated is the etag', () => {
    const task = parseTask({ updated: '2026-09-20T17:58:54.988820952+03:00' })

    expect(task.created).toBe('2026-09-20T17:57:12+03:00')
    expect(task.updated).toBe('2026-09-20T17:58:54.988820952+03:00')
  })
})

describe('vikunjaTaskSchema collections', () => {
  it('turns null collections into empty arrays (recon Q13/Q21)', () => {
    const task = parseTask()

    expect(task.labels).toEqual([])
    expect(task.assignees).toEqual([])
    expect(task.reminders).toEqual([])
    expect(task.attachments).toEqual([])
  })

  it('accepts a missing collection key as well', () => {
    const withoutLabels: Record<string, unknown> = { ...RAW_TASK }
    delete withoutLabels.labels
    const parsed = vikunjaTaskSchema.safeParse(withoutLabels)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.labels).toEqual([])
  })

  it('parses real labels through', () => {
    const task = parseTask({ labels: [{ id: 1, title: 'energy:1', hex_color: 'efbdeb' }] })

    expect(task.labels).toEqual([{ id: 1, title: 'energy:1', hex_color: 'efbdeb' }])
  })

  it('carries related_tasks through in both observed shapes', () => {
    expect(parseTask({ related_tasks: null }).related_tasks).toBeNull()
    expect(parseTask({ related_tasks: {} }).related_tasks).toEqual({})
    expect(parseTask({ related_tasks: { subtask: [{ id: 9 }] } }).related_tasks).toEqual({
      subtask: [{ id: 9 }],
    })
  })
})

describe('vikunjaTaskSchema passthrough', () => {
  /**
   * The reason the schema is loose: `POST /tasks/:id` is a full replace
   * (recon Q9), so anything stripped here would be wiped from the user's
   * instance on the first edit task 6 makes.
   */
  it('keeps fields the schema does not model', () => {
    const task = parseTask({
      reactions: null,
      subscription: { entity: 'task', id: 4 },
      bucket_title: 'To-Do',
      in_bucket: 1,
    }) as Record<string, unknown>

    expect(task.reactions).toBeNull()
    expect(task.subscription).toEqual({ entity: 'task', id: 4 })
    expect(task.bucket_title).toBe('To-Do')
    expect(task.in_bucket).toBe(1)
  })

  it('keeps unmodelled fields of a nested assignee too', () => {
    const task = parseTask({
      assignees: [{ id: 1, username: 'probe', name: '', created: '2026-01-01T00:00:00Z' }],
    })

    expect((task.assignees[0] as Record<string, unknown>).created).toBe('2026-01-01T00:00:00Z')
  })

  it('still rejects a task missing a field we rely on', () => {
    const withoutEtag: Record<string, unknown> = { ...RAW_TASK }
    delete withoutEtag.updated

    expect(vikunjaTaskSchema.safeParse(withoutEtag).success).toBe(false)
  })
})

describe('vikunjaTaskSchema prototype safety', () => {
  /**
   * A passthrough schema copies whatever the instance sent, and task 6
   * spreads the parsed record into a new object. An own `__proto__` key
   * surviving that far would stop being data.
   */
  it('drops __proto__, constructor and prototype keys', () => {
    // `JSON.parse` is the only way to get an *own* `__proto__` data property;
    // an object literal would assign the prototype instead.
    const hostile = JSON.parse(
      JSON.stringify({ ...RAW_TASK, constructor: 'nope', prototype: 'nope' }).replace(
        '{',
        '{"__proto__":{"polluted":true},',
      ),
    ) as Record<string, unknown>

    // Guards the guard: without this the assertions below pass vacuously.
    expect(Object.hasOwn(hostile, '__proto__')).toBe(true)

    const parsed = vikunjaTaskSchema.safeParse(hostile)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const data = parsed.data as Record<string, unknown>
    expect(Object.hasOwn(data, '__proto__')).toBe(false)
    expect(data.constructor).not.toBe('nope')
    expect(data.prototype).toBeUndefined()
    expect({ ...data }).not.toHaveProperty('polluted')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('leaves the rest of the passthrough payload alone', () => {
    const parsed = parseTask({ reactions: null }) as Record<string, unknown>

    expect(Object.hasOwn(parsed, 'reactions')).toBe(true)
  })
})

describe('vikunjaBucketWithTasksSchema', () => {
  /** Empty bucket, before any task existed — no `tasks` key at all (recon Q2). */
  const EMPTY_BUCKET = {
    id: 1,
    title: 'To-Do',
    project_view_id: 4,
    limit: 0,
    count: 0,
    position: 100,
  }

  it('parses a bucket that carries no tasks key', () => {
    const parsed = vikunjaBucketWithTasksSchema.safeParse(EMPTY_BUCKET)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.tasks).toBeUndefined()
    expect(parsed.data.id).toBe(1)
  })

  it('parses a bucket with nested tasks', () => {
    const parsed = vikunjaBucketWithTasksSchema.safeParse({
      ...EMPTY_BUCKET,
      tasks: [RAW_TASK],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.tasks?.[0].bucket_id).toBe(1)
  })

  it('parses the bare bucket shape too', () => {
    expect(vikunjaBucketSchema.safeParse(EMPTY_BUCKET).success).toBe(true)
  })
})

describe('the remaining wire shapes', () => {
  it('parses GET /info down to the two fields we act on', () => {
    expect(
      vikunjaInfoSchema.parse({
        version: 'v2.6.0',
        max_items_per_page: 50,
        concurrent_writes: true,
        task_comments_enabled: true,
        webhooks_enabled: true,
      }),
    ).toEqual({ version: 'v2.6.0', max_items_per_page: 50 })

    expect(vikunjaInfoSchema.safeParse({ version: 'v2.5.1' }).success).toBe(true)
    expect(vikunjaInfoSchema.safeParse({}).success).toBe(false)
  })

  it('parses a user', () => {
    expect(vikunjaUserSchema.parse({ id: 1, username: 'probe', name: '' })).toMatchObject({
      id: 1,
      username: 'probe',
    })
  })

  it('parses a label', () => {
    expect(vikunjaLabelSchema.parse({ id: 1, title: 'energy:1', hex_color: 'efbdeb' })).toEqual({
      id: 1,
      title: 'energy:1',
      hex_color: 'efbdeb',
    })
  })

  it('parses a view, sentinel bucket ids included (recon Q5)', () => {
    expect(
      vikunjaViewSchema.parse({
        id: 4,
        title: 'Kanban',
        view_kind: 'kanban',
        filter: null,
        bucket_configuration_mode: 'manual',
        default_bucket_id: 1,
        done_bucket_id: 3,
      }),
    ).toEqual({
      id: 4,
      title: 'Kanban',
      view_kind: 'kanban',
      default_bucket_id: 1,
      done_bucket_id: 3,
    })
  })

  it('parses a project with its embedded views', () => {
    const parsed = vikunjaProjectSchema.parse({
      id: 1,
      title: 'Inbox',
      identifier: '',
      is_archived: false,
      views: [
        { id: 1, title: 'List', view_kind: 'list', default_bucket_id: 0, done_bucket_id: 0 },
        { id: 4, title: 'Kanban', view_kind: 'kanban', default_bucket_id: 1, done_bucket_id: 3 },
      ],
    })

    expect(parsed.views.map((view) => view.view_kind)).toEqual(['list', 'kanban'])
  })

  it('treats a null views collection as empty', () => {
    expect(
      vikunjaProjectSchema.parse({
        id: 2,
        title: 'Archived',
        identifier: 'ARCH',
        is_archived: true,
        views: null,
      }).views,
    ).toEqual([])
  })

  it('parses the TaskBucket answer of a bucket move (recon Q4)', () => {
    const parsed = vikunjaTaskBucketSchema.parse({
      task_id: 4,
      bucket_id: 3,
      project_view_id: 4,
      task: { ...RAW_TASK, done: true, done_at: '2026-09-20T14:58:54.988789804Z', bucket_id: 0 },
      bucket: { id: 3, title: 'Done', project_view_id: 4 },
    })

    expect(parsed.task_id).toBe(4)
    expect(parsed.task.done).toBe(true)
    expect(parsed.task.done_at).toBe('2026-09-20T14:58:54.988789804Z')
  })
})
