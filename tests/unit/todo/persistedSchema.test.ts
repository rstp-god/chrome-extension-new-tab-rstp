import { isTrelloRef, isVikunjaRef } from '@/widgets/Todo/integrations/index.ts'
import { todoEnvelopeSchema } from '@/widgets/Todo/store/store.ts'
import {
  makeTrelloEnvelope,
  makeVikunjaEnvelope,
  type RawTodoEnvelope,
} from '@tests/fixtures/todoEnvelope.ts'
import { describe, expect, it } from 'vitest'

/**
 * `withChromeSync` drops the whole envelope when `safeParse` fails — that is
 * the entire task list. So these tests are less about zod and more about the
 * promise that adding Vikunja to the persisted schema costs no user data:
 * an envelope written by the Trello-only build must still come back out
 * byte-for-byte identical.
 *
 * Expectations are derived from the fixture rather than hardcoded, so
 * growing or reshaping it doesn't turn into red tests.
 */

function parse(raw: unknown) {
  const result = todoEnvelopeSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`envelope was rejected: ${JSON.stringify(result.error.issues, null, 2)}`)
  }
  return result.data
}

/** Indexes of the fixture tasks that carry a remote ref. */
function indexesWithRef(raw: RawTodoEnvelope): number[] {
  return raw.state.tasks.flatMap((task, index) => (task.remoteRef === null ? [] : [index]))
}

describe('todo persisted envelope — Trello records written before Vikunja existed', () => {
  it('round-trips an old envelope unchanged', () => {
    const raw = makeTrelloEnvelope()

    const parsed = parse(raw)

    expect(parsed).toStrictEqual(raw)
  })

  it('keeps a Trello remoteRef intact despite the .catch(null) fallback', () => {
    const raw = makeTrelloEnvelope()
    const index = indexesWithRef(raw)[0]

    const parsed = parse(raw)

    const ref = parsed.state.tasks[index].remoteRef
    expect(ref).toStrictEqual(raw.state.tasks[index].remoteRef)
    expect(ref && isTrelloRef(ref)).toBe(true)
  })

  it('keeps the tasks that never reached Trello (remoteRef: null)', () => {
    const raw = makeTrelloEnvelope()
    const expectedIds = raw.state.tasks
      .filter((task) => task.remoteRef === null)
      .map((task) => task.id)
    expect(expectedIds.length).toBeGreaterThan(0)

    const parsed = parse(raw)

    expect(
      parsed.state.tasks.filter((task) => task.remoteRef === null).map((task) => task.id),
    ).toStrictEqual(expectedIds)
  })

  it('parses the trello branch of the integration union with its mapping', () => {
    const raw = makeTrelloEnvelope()

    const parsed = parse(raw)

    const integration = parsed.state.integration
    expect(integration?.name).toBe('trello')
    if (integration?.name !== 'trello') throw new Error('expected the trello branch')

    expect(integration).toStrictEqual(raw.state.integration)
    expect(integration.config.boardId).toBeTruthy()
    expect(integration.mapping).not.toBeNull()
  })
})

describe('todo persisted envelope — Vikunja records', () => {
  it('round-trips a Vikunja envelope unchanged', () => {
    const raw = makeVikunjaEnvelope()

    const parsed = parse(raw)

    expect(parsed).toStrictEqual(raw)
  })

  it('parses a Vikunja remoteRef through the second branch of the ref union', () => {
    const raw = makeVikunjaEnvelope()
    const index = indexesWithRef(raw)[0]

    const parsed = parse(raw)

    const ref = parsed.state.tasks[index].remoteRef
    expect(ref && isVikunjaRef(ref)).toBe(true)
    if (!ref || !isVikunjaRef(ref)) throw new Error('expected a vikunja ref')
    expect(ref).toStrictEqual(raw.state.tasks[index].remoteRef)
  })

  it('accepts a flat-mode ref with bucketId: null', () => {
    const parsed = parse(makeVikunjaEnvelope())

    const flat = parsed.state.tasks
      .map((task) => task.remoteRef)
      .find((ref) => ref !== null && isVikunjaRef(ref) && ref.bucketId === null)
    expect(flat).toBeDefined()
  })

  it('parses the vikunja branch of the integration union', () => {
    const raw = makeVikunjaEnvelope()

    const parsed = parse(raw)

    const integration = parsed.state.integration
    expect(integration?.name).toBe('vikunja')
    if (integration?.name !== 'vikunja') throw new Error('expected the vikunja branch')

    expect(integration).toStrictEqual(raw.state.integration)
    expect(integration.config.boards).toHaveLength(1)
    expect(integration.config.defaultProjectId).toBe(integration.config.boards[0].projectId)
  })

  it('rejects the envelope when baseUrl is not a URL', () => {
    const raw = makeVikunjaEnvelope()
    ;(raw.state.integration as Record<string, unknown>).config = {
      baseUrl: 'not-a-url',
      token: 'tk',
      boards: [],
      defaultProjectId: null,
    }

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects a plain-http baseUrl — the token travels on every request', () => {
    const raw = makeVikunjaEnvelope()
    const config = (raw.state.integration as { config: Record<string, unknown> }).config
    config.baseUrl = 'http://vikunja.example.com'

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })

  it('accepts https on a self-hosted host and port', () => {
    const raw = makeVikunjaEnvelope()
    const config = (raw.state.integration as { config: Record<string, unknown> }).config
    config.baseUrl = 'https://localhost:8080'

    const parsed = parse(raw)

    const integration = parsed.state.integration
    if (integration?.name !== 'vikunja') throw new Error('expected the vikunja branch')
    expect(integration.config.baseUrl).toBe('https://localhost:8080')
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
    const broken = indexesWithRef(raw)[0]
    const untouched = raw.state.tasks.filter((_, index) => index !== broken)
    const { title } = raw.state.tasks[broken]
    // Half-written Trello ref: wrong types, missing fields.
    raw.state.tasks[broken].remoteRef = { cardId: 42, listId: null }

    const parsed = parse(raw)

    expect(parsed.state.tasks).toHaveLength(raw.state.tasks.length)
    expect(parsed.state.tasks[broken].remoteRef).toBeNull()
    expect(parsed.state.tasks[broken].title).toBe(title)
    expect(parsed.state.tasks.filter((_, index) => index !== broken)).toStrictEqual(untouched)
  })

  it('degrades a ref of a completely foreign shape to null', () => {
    const raw = makeTrelloEnvelope()
    const [first, second, third] = indexesWithRef(raw)
    expect(third).toBeDefined()
    raw.state.tasks[first].remoteRef = 'card-0'
    raw.state.tasks[second].remoteRef = { taskId: 'not-a-number', identifier: 7 }

    const parsed = parse(raw)

    expect(parsed.state.tasks[first].remoteRef).toBeNull()
    expect(parsed.state.tasks[second].remoteRef).toBeNull()
    expect(parsed.state.tasks[third].remoteRef).not.toBeNull()
  })

  it('still rejects the envelope when a task is broken outside remoteRef', () => {
    const raw = makeTrelloEnvelope()
    delete raw.state.tasks[0].title

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })
})
