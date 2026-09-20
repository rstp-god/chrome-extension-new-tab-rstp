import { isTrelloRef, isVikunjaRef } from '@/widgets/Todo/integrations/index.ts'
import { todoEnvelopeSchema } from '@/widgets/Todo/store/store.ts'
import { makeTrelloEnvelope, makeVikunjaEnvelope } from '@tests/fixtures/todoEnvelope.ts'
import { describe, expect, it } from 'vitest'

/**
 * `withChromeSync` drops the whole envelope when `safeParse` fails — that is
 * the entire task list. So these tests are less about zod and more about the
 * promise that adding Vikunja to the persisted schema costs no user data:
 * an envelope written by the Trello-only build must still come back out
 * byte-for-byte identical.
 */

function parse(raw: unknown) {
  const result = todoEnvelopeSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`envelope was rejected: ${JSON.stringify(result.error.issues, null, 2)}`)
  }
  return result.data
}

describe('todo persisted envelope — Trello records written before Vikunja existed', () => {
  it('round-trips an old envelope unchanged', () => {
    const raw = makeTrelloEnvelope()

    const parsed = parse(raw)

    expect(parsed).toEqual(raw)
    expect(parsed.state.tasks).toHaveLength(22)
  })

  it('keeps a Trello remoteRef intact despite the .catch(null) fallback', () => {
    const parsed = parse(makeTrelloEnvelope())

    const task = parsed.state.tasks.find((t) => t.id === 'task-0')
    expect(task?.remoteRef).toEqual({
      cardId: 'card-0',
      shortLink: 'sl0',
      listId: 'list-inbox',
      etag: '2024-08-01T10:00:00.000Z',
    })

    const ref = task?.remoteRef
    expect(ref && isTrelloRef(ref)).toBe(true)
  })

  it('keeps the tasks that never reached Trello (remoteRef: null)', () => {
    const parsed = parse(makeTrelloEnvelope())

    const local = parsed.state.tasks.filter((task) => task.remoteRef === null)
    expect(local.length).toBeGreaterThan(0)
    expect(local.map((task) => task.id)).toEqual(['task-4', 'task-9', 'task-14', 'task-19'])
  })

  it('parses the trello branch of the integration union with its mapping', () => {
    const parsed = parse(makeTrelloEnvelope())

    const integration = parsed.state.integration
    expect(integration?.name).toBe('trello')
    if (integration?.name !== 'trello') throw new Error('expected the trello branch')

    expect(integration.config.boardId).toBe('board-1')
    expect(integration.config.apiKey).toBe('api-key-abc')
    expect(integration.mapping?.input).toEqual(['list-inbox', 'list-someday'])
    expect(integration.lists).toHaveLength(6)
    expect(integration.projects).toHaveLength(3)
  })
})

describe('todo persisted envelope — Vikunja records', () => {
  it('round-trips a Vikunja envelope unchanged', () => {
    const raw = makeVikunjaEnvelope()

    const parsed = parse(raw)

    expect(parsed).toEqual(raw)
  })

  it('parses a Vikunja remoteRef through the second branch of the ref union', () => {
    const parsed = parse(makeVikunjaEnvelope())

    const ref = parsed.state.tasks[0].remoteRef
    expect(ref && isVikunjaRef(ref)).toBe(true)
    if (!ref || !isVikunjaRef(ref)) throw new Error('expected a vikunja ref')

    expect(ref.taskId).toBe(42)
    expect(ref.identifier).toBe('#42')
    expect(ref.bucketId).toBe(8)
    expect(ref.updated).toBe('2024-08-19T12:34:56Z')
  })

  it('accepts a flat-mode ref with bucketId: null', () => {
    const parsed = parse(makeVikunjaEnvelope())

    const ref = parsed.state.tasks[1].remoteRef
    if (!ref || !isVikunjaRef(ref)) throw new Error('expected a vikunja ref')
    expect(ref.bucketId).toBeNull()
  })

  it('parses the vikunja branch of the integration union', () => {
    const parsed = parse(makeVikunjaEnvelope())

    const integration = parsed.state.integration
    expect(integration?.name).toBe('vikunja')
    if (integration?.name !== 'vikunja') throw new Error('expected the vikunja branch')

    expect(integration.config.baseUrl).toBe('https://vikunja.example.com')
    expect(integration.config.projectId).toBe(3)
    expect(integration.config.viewId).toBe(11)
    expect(integration.config.kanbanMapping).toBe(true)
    expect(integration.mapping?.inprogress).toEqual(['8'])
  })

  it('rejects the envelope when baseUrl is not a URL', () => {
    const raw = makeVikunjaEnvelope()
    ;(raw.state.integration as Record<string, unknown>).config = {
      baseUrl: 'not-a-url',
      token: 'tk',
      projectId: null,
      viewId: null,
      kanbanMapping: false,
    }

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects an integration with an unknown name', () => {
    const raw = makeVikunjaEnvelope()
    ;(raw.state.integration as Record<string, unknown>).name = 'asana'

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })
})

describe('todo persisted envelope — a broken remoteRef never costs a task', () => {
  it('degrades a malformed ref to null and leaves the rest of the array alone', () => {
    const raw = makeTrelloEnvelope()
    // Half-written Trello ref: wrong types, missing fields.
    raw.state.tasks[3].remoteRef = { cardId: 42, listId: null }

    const parsed = parse(raw)

    expect(parsed.state.tasks).toHaveLength(22)
    expect(parsed.state.tasks[3].remoteRef).toBeNull()
    expect(parsed.state.tasks[3].title).toBe('Trello task 3')
    expect(parsed.state.tasks.filter((_, index) => index !== 3)).toEqual(
      raw.state.tasks.filter((_, index) => index !== 3),
    )
  })

  it('degrades a ref of a completely foreign shape to null', () => {
    const raw = makeTrelloEnvelope()
    raw.state.tasks[0].remoteRef = 'card-0'
    raw.state.tasks[1].remoteRef = { taskId: 'not-a-number', identifier: 7 }

    const parsed = parse(raw)

    expect(parsed.state.tasks[0].remoteRef).toBeNull()
    expect(parsed.state.tasks[1].remoteRef).toBeNull()
    expect(parsed.state.tasks[2].remoteRef).not.toBeNull()
  })

  it('still rejects the envelope when a task is broken outside remoteRef', () => {
    const raw = makeTrelloEnvelope()
    delete raw.state.tasks[5].title

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })
})
