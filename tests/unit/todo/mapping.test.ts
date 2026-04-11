import {
  buildCardDescription,
  cardToTask,
  labelToProject,
  parseHiddenMetadata,
  primaryListIdForStatus,
  statusForListId,
  writeHiddenMetadata,
} from '@/widgets/Todo/integrations/trello/mapping.ts'
import type { TrelloCard } from '@/widgets/Todo/integrations/trello/schema.ts'
import type { StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import {
  FIXTURE_TIMESTAMP,
  hiddenMetadataFixture,
  listMappingFixture,
  trelloCardFixture,
  trelloCardWithCorruptMetadataFixture,
  trelloCardWithoutMetadataFixture,
  trelloLabelsFixture,
} from '@tests/fixtures/trello.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('parseHiddenMetadata', () => {
  it('returns parsed meta and stripped userText for a valid block', () => {
    const desc = trelloCardFixture().desc
    const result = parseHiddenMetadata(desc)
    expect(result.meta).toEqual(hiddenMetadataFixture)
    expect(result.userText).toBe('Card body')
  })

  it('returns the trimmed desc with meta=null when no metadata block is present', () => {
    const result = parseHiddenMetadata('Just a plain description\n')
    expect(result.meta).toBeNull()
    expect(result.userText).toBe('Just a plain description')
  })

  it('strips the comment but yields meta=null on JSON parse failure', () => {
    const result = parseHiddenMetadata(trelloCardWithCorruptMetadataFixture.desc)
    expect(result.meta).toBeNull()
    expect(result.userText).toBe('User text')
  })

  it('strips the comment but yields meta=null on Zod validation failure', () => {
    const desc = 'User text\n\n<!-- newtab-todo:v1\n{"version":2,"localId":"x"}\n-->'
    const result = parseHiddenMetadata(desc)
    expect(result.meta).toBeNull()
    expect(result.userText).toBe('User text')
  })

  it('only matches metadata blocks anchored to the end of the description', () => {
    const desc = 'User text\n\n<!-- newtab-todo:v1\n{"version":1,"localId":"x","createdAt":1,"statusChangedAt":1}\n-->\ntrailing user content'
    const result = parseHiddenMetadata(desc)
    expect(result.meta).toBeNull()
    // Regex didn't match, so the whole desc (trimEnd) is returned as userText.
    expect(result.userText).toBe(desc.trimEnd())
  })
})

describe('writeHiddenMetadata', () => {
  it('round-trips through parseHiddenMetadata', () => {
    const written = writeHiddenMetadata('hello world', hiddenMetadataFixture)
    const parsed = parseHiddenMetadata(written)
    expect(parsed.meta).toEqual(hiddenMetadataFixture)
    expect(parsed.userText).toBe('hello world')
  })

  it('produces a block-only description when userText is empty', () => {
    const written = writeHiddenMetadata('', hiddenMetadataFixture)
    expect(written.startsWith('<!--')).toBe(true)
    const parsed = parseHiddenMetadata(written)
    expect(parsed.meta).toEqual(hiddenMetadataFixture)
    expect(parsed.userText).toBe('')
  })

  it('trims trailing whitespace from userText', () => {
    const written = writeHiddenMetadata('hello   \n\n', hiddenMetadataFixture)
    const parsed = parseHiddenMetadata(written)
    expect(parsed.userText).toBe('hello')
  })
})

describe('statusForListId', () => {
  it('returns the matching status when listId is the (only) primary element', () => {
    expect(statusForListId('list-inprogress', listMappingFixture)).toBe('inprogress')
  })

  it('returns the matching status when listId is a non-first (alias) element', () => {
    const mapping: StatusListMapping = {
      ...listMappingFixture,
      struggle: ['list-struggle', 'list-blocked', 'list-stuck-alt'],
    }
    expect(statusForListId('list-stuck-alt', mapping)).toBe('struggle')
  })

  it('falls back to "input" when listId is in no mapping array', () => {
    expect(statusForListId('list-unknown', listMappingFixture)).toBe('input')
  })
})

describe('primaryListIdForStatus', () => {
  it('returns the first listId of the array', () => {
    const mapping: StatusListMapping = {
      ...listMappingFixture,
      inprogress: ['list-doing-primary', 'list-doing-alias'],
    }
    expect(primaryListIdForStatus('inprogress', mapping)).toBe('list-doing-primary')
  })
})

describe('labelToProject', () => {
  it('builds a Project with id, name, and pillClassName from getTrelloProjectPillClass', () => {
    const greenLabel = trelloLabelsFixture[0]
    const project = labelToProject(greenLabel)
    expect(project.id).toBe('label-green')
    expect(project.name).toBe('Feature')
    // green hue → emerald-* tailwind class chain
    expect(project.pillClassName).toContain('emerald')
  })

  it('falls back to the default pill class when label color is null', () => {
    const noColorLabel = trelloLabelsFixture[3]
    const project = labelToProject(noColorLabel)
    expect(project.pillClassName).toContain('bg-muted')
  })
})

describe('cardToTask', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXTURE_TIMESTAMP))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses meta.localId when valid hidden metadata is present', () => {
    const task = cardToTask(trelloCardFixture(), listMappingFixture)
    expect(task.id).toBe(hiddenMetadataFixture.localId)
  })

  it('falls back to existingId when metadata is absent', () => {
    const task = cardToTask(trelloCardWithoutMetadataFixture, listMappingFixture, 'existing-id-99')
    expect(task.id).toBe('existing-id-99')
  })

  it('falls back to crypto.randomUUID when neither metadata nor existingId is present', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-2222-3333-4444-555555555555',
    )
    const task = cardToTask(trelloCardWithoutMetadataFixture, listMappingFixture)
    expect(spy).toHaveBeenCalledOnce()
    expect(task.id).toBe('11111111-2222-3333-4444-555555555555')
    spy.mockRestore()
  })

  it('uses card.idLabels[0] as the projectId', () => {
    const task = cardToTask(
      trelloCardFixture({ idLabels: ['label-primary', 'label-secondary'] }),
      listMappingFixture,
    )
    expect(task.projectId).toBe('label-primary')
  })

  it('sets projectId to null when idLabels is empty', () => {
    const task = cardToTask(trelloCardFixture({ idLabels: [] }), listMappingFixture)
    expect(task.projectId).toBeNull()
  })

  it('derives status from idList via the mapping', () => {
    const task = cardToTask(
      trelloCardFixture({ id: 'c2', idList: 'list-struggle', desc: '' }),
      listMappingFixture,
    )
    expect(task.status).toBe('struggle')
  })

  it('parses dateLastActivity into statusChangedAt when metadata is absent', () => {
    const card: TrelloCard = {
      ...trelloCardWithoutMetadataFixture,
      dateLastActivity: '2024-01-15T10:00:00.000Z',
    }
    const task = cardToTask(card, listMappingFixture)
    expect(task.statusChangedAt).toBe(Date.parse('2024-01-15T10:00:00.000Z'))
    expect(task.createdAt).toBe(Date.parse('2024-01-15T10:00:00.000Z'))
  })

  it('falls back to Date.now() when dateLastActivity is null', () => {
    const card: TrelloCard = {
      ...trelloCardWithoutMetadataFixture,
      dateLastActivity: null,
    }
    const task = cardToTask(card, listMappingFixture)
    expect(task.statusChangedAt).toBe(FIXTURE_TIMESTAMP)
    expect(task.createdAt).toBe(FIXTURE_TIMESTAMP)
  })

  it('sets completedAt only when status resolves to "completed"', () => {
    const card = trelloCardFixture({ id: 'c-done', idList: 'list-completed', desc: '' })
    const task = cardToTask(card, listMappingFixture)
    expect(task.status).toBe('completed')
    expect(task.completedAt).toBe(task.statusChangedAt)
    expect(task.deletedAt).toBeNull()
  })

  it('sets deletedAt only when status resolves to "deleted"', () => {
    const card = trelloCardFixture({ id: 'c-trash', idList: 'list-deleted', desc: '' })
    const task = cardToTask(card, listMappingFixture)
    expect(task.status).toBe('deleted')
    expect(task.deletedAt).toBe(task.statusChangedAt)
    expect(task.completedAt).toBeNull()
  })

  it('always sets linkedTab to null and syncState to "clean"', () => {
    const task = cardToTask(trelloCardFixture(), listMappingFixture)
    expect(task.linkedTab).toBeNull()
    expect(task.syncState).toBe('clean')
  })

  it('builds remoteRef with cardId / shortLink / listId / etag from the card', () => {
    const task = cardToTask(trelloCardFixture(), listMappingFixture)
    expect(task.remoteRef).toEqual({
      cardId: 'card-1',
      shortLink: 'abc123',
      listId: 'list-input',
      etag: '2023-11-14T22:13:20.000Z',
    })
  })

  it('handles missing shortLink and dateLastActivity by storing null', () => {
    const card = trelloCardFixture({
      id: 'c-bare',
      shortLink: null,
      dateLastActivity: null,
      desc: '',
    })
    const task = cardToTask(card, listMappingFixture)
    expect(task.remoteRef?.shortLink).toBeNull()
    expect(task.remoteRef?.etag).toBeNull()
  })

  it('preserves the userText from hidden metadata as the description', () => {
    const task = cardToTask(trelloCardFixture(), listMappingFixture)
    expect(task.description).toBe('Card body')
  })

  it('returns description=null when stripped userText is empty', () => {
    const card = trelloCardFixture({
      desc: writeHiddenMetadata('', hiddenMetadataFixture),
    })
    const task = cardToTask(card, listMappingFixture)
    expect(task.description).toBeNull()
  })
})

describe('buildCardDescription', () => {
  it('round-trips through parseHiddenMetadata with task identity preserved', () => {
    const task = {
      id: 'task-77',
      title: 'Hi',
      description: null,
      status: 'input',
      projectId: null,
      createdAt: 111,
      statusChangedAt: 222,
      completedAt: null,
      deletedAt: null,
      linkedTab: null,
      remoteRef: null,
      syncState: 'clean',
    } satisfies TodoTask

    const desc = buildCardDescription(task, 'user copy')
    const parsed = parseHiddenMetadata(desc)
    expect(parsed.userText).toBe('user copy')
    expect(parsed.meta).toEqual({
      version: 1,
      localId: 'task-77',
      createdAt: 111,
      statusChangedAt: 222,
    })
  })
})
