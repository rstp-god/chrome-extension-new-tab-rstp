import {
  composeCardDescription,
  parseCardMetadata,
  stripMetadata,
} from '@/widgets/Todo/integration/trello/metadata.ts'
import { describe, expect, it } from 'vitest'

describe('todo integration metadata', () => {
  it('serializes and parses metadata block with user description', () => {
    const description = composeCardDescription('User notes', {
      schemaVersion: 1,
      taskId: 'task-1',
      labels: [{ name: 'Kontur', color: 'green', trelloId: 'label-1' }],
      substate: 'inProgress',
      updatedAt: 100,
    })

    expect(stripMetadata(description)).toBe('User notes')
    expect(parseCardMetadata(description)).toEqual({
      schemaVersion: 1,
      taskId: 'task-1',
      labels: [{ name: 'Kontur', color: 'green', trelloId: 'label-1' }],
      substate: 'inProgress',
      updatedAt: 100,
    })
  })

  it('returns null for description without metadata block', () => {
    expect(parseCardMetadata('plain text')).toBeNull()
    expect(stripMetadata('plain text')).toBe('plain text')
  })
})
