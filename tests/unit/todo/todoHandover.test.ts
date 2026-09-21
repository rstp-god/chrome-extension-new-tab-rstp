import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAreaMock = vi.hoisted(() => vi.fn<(area: string, key: string) => Promise<unknown>>())
const removeAreaMock = vi.hoisted(() => vi.fn(async () => {}))
const setAreaMock = vi.hoisted(() => vi.fn(async () => true))

vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: getAreaMock,
  setArea: setAreaMock,
  removeArea: removeAreaMock,
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

import {
  buildHandoverSnapshot,
  expireHandoverSnapshot,
  saveHandoverSnapshot,
  TODO_HANDOVER_KEY,
} from '@/widgets/Todo/store/handover.ts'
import { TODO_HANDOVER_MAX_BYTES, TODO_HANDOVER_TTL_MS } from '@/widgets/Todo/store/schema.ts'

import type { IntegrationState, TodoTask } from '@/widgets/Todo/store/store.ts'

/**
 * The copy the widget leaves behind: what it carries, how big it is allowed
 * to be, and when it goes away.
 */
const NOW = 1_724_000_000_000

const INTEGRATION: IntegrationState = {
  name: 'vikunja',
  config: {
    baseUrl: 'https://vikunja.example',
    token: 'tk_super-secret-value',
    projectId: 1,
    viewId: 4,
    kanbanMapping: true,
  },
  boardName: 'Probe',
  lists: [{ id: '1', name: 'To-Do' }],
  projects: [],
  mapping: {
    input: ['1'],
    inprogress: ['1'],
    struggle: ['1'],
    completed: ['1'],
    deleted: ['1'],
  },
  lastSyncAt: null,
}

function task(index: number, title = `Task ${index}`): TodoTask {
  return {
    id: `task-${index}`,
    title,
    description: null,
    status: 'input',
    projectId: null,
    createdAt: NOW,
    statusChangedAt: NOW,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
  }
}

beforeEach(() => {
  getAreaMock.mockReset()
  removeAreaMock.mockClear()
  setAreaMock.mockClear()
})

describe('buildHandoverSnapshot', () => {
  it('carries the tasks and the bearings, and nothing of the config', () => {
    const snapshot = buildHandoverSnapshot(INTEGRATION, [task(1)], NOW)

    expect(snapshot).toEqual({
      version: 1,
      savedAt: NOW,
      integrationName: 'vikunja',
      boardName: 'Probe',
      tasks: [task(1)],
    })
    // Not just "no token": nothing of the config at all.
    expect(JSON.stringify(snapshot)).not.toContain('tk_super-secret-value')
    expect(JSON.stringify(snapshot)).not.toContain('baseUrl')
  })

  it('leaves `truncated` out when the whole list fits', () => {
    const snapshot = buildHandoverSnapshot(INTEGRATION, [task(1), task(2)], NOW)

    expect(snapshot?.truncated).toBeUndefined()
    expect(snapshot?.tasks).toHaveLength(2)
  })

  it('drops the tail to fit the budget and says that it did', () => {
    // ~2 KB of title each, so a few thousand of them cannot fit.
    const fat = Array.from({ length: 2_000 }, (_, index) => task(index, 'x'.repeat(2_048)))

    const snapshot = buildHandoverSnapshot(INTEGRATION, fat, NOW)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.truncated).toBe(true)
    expect(snapshot?.tasks.length).toBeGreaterThan(0)
    expect(snapshot?.tasks.length).toBeLessThan(fat.length)
    // Kept from the head, in order.
    expect(snapshot?.tasks[0].id).toBe('task-0')
    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(TODO_HANDOVER_MAX_BYTES)
  })

  it('counts bytes rather than characters', () => {
    // Cyrillic titles are two bytes per character; a budget measured in
    // characters would let roughly twice as much through.
    const cyrillic = Array.from({ length: 2_000 }, (_, index) => task(index, 'я'.repeat(2_048)))

    const snapshot = buildHandoverSnapshot(INTEGRATION, cyrillic, NOW)

    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
    expect(bytes).toBeLessThanOrEqual(TODO_HANDOVER_MAX_BYTES)
  })
})

describe('saveHandoverSnapshot', () => {
  it('writes under the handover key', async () => {
    await saveHandoverSnapshot(INTEGRATION, [task(1)], NOW)

    expect(setAreaMock).toHaveBeenCalledWith(
      'local',
      TODO_HANDOVER_KEY,
      expect.objectContaining({ version: 1, savedAt: NOW }),
    )
  })

  it('writes nothing without an integration', async () => {
    await saveHandoverSnapshot(null, [task(1)], NOW)

    expect(setAreaMock).not.toHaveBeenCalled()
  })
})

describe('expireHandoverSnapshot', () => {
  function stored(savedAt: number) {
    return {
      version: 1,
      savedAt,
      integrationName: 'vikunja',
      boardName: 'Probe',
      tasks: [task(1)],
    }
  }

  it('drops a copy older than the TTL', async () => {
    getAreaMock.mockResolvedValue(stored(NOW - TODO_HANDOVER_TTL_MS - 1))

    await expireHandoverSnapshot(NOW)

    expect(removeAreaMock).toHaveBeenCalledWith('local', TODO_HANDOVER_KEY)
  })

  it('keeps one that is still within it', async () => {
    getAreaMock.mockResolvedValue(stored(NOW - TODO_HANDOVER_TTL_MS + 1_000))

    await expireHandoverSnapshot(NOW)

    expect(removeAreaMock).not.toHaveBeenCalled()
  })

  it('does nothing when there is no copy', async () => {
    getAreaMock.mockResolvedValue(null)

    await expireHandoverSnapshot(NOW)

    expect(removeAreaMock).not.toHaveBeenCalled()
  })

  it('leaves a record it cannot parse alone', async () => {
    // Possibly a newer version's format; deleting what we do not understand
    // is how a future snapshot loses its data to an old tab.
    getAreaMock.mockResolvedValue({ version: 2, whatever: true })

    await expireHandoverSnapshot(NOW)

    expect(removeAreaMock).not.toHaveBeenCalled()
  })

  it('swallows a storage failure', async () => {
    getAreaMock.mockRejectedValue(new Error('quota'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(expireHandoverSnapshot(NOW)).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalled()
  })
})
