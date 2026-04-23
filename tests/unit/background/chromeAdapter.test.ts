import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOrUpdateGroup } from '@/background/chromeAdapter.ts'

type ChromeMock = {
  tabs: {
    group: ReturnType<typeof vi.fn>
    move: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
  }
  tabGroups: {
    query: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

function installChromeMock(overrides: Partial<ChromeMock> = {}): ChromeMock {
  const chromeMock: ChromeMock = {
    tabs: {
      group: vi.fn().mockResolvedValue(42),
      move: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([
        { id: 3, index: 5, windowId: 1 },
        { id: 1, index: 6, windowId: 1 },
        { id: 2, index: 7, windowId: 1 },
      ]),
      ...overrides.tabs,
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      ...overrides.tabGroups,
    },
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = chromeMock
  return chromeMock
}

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome
})

describe('createOrUpdateGroup', () => {
  it('reorders tabs to match tabIds order after grouping', async () => {
    const chromeMock = installChromeMock()

    await createOrUpdateGroup(1, 'Work', 'blue', [3, 1, 2])

    expect(chromeMock.tabs.group).toHaveBeenCalledWith({
      tabIds: [3, 1, 2],
      createProperties: { windowId: 1 },
    })
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(42, {
      title: 'Work',
      color: 'blue',
    })
    expect(chromeMock.tabs.move).toHaveBeenCalledWith([3, 1, 2], { index: 5 })
  })

  it('uses the minimum index of the group as the anchor', async () => {
    const chromeMock = installChromeMock({
      tabs: {
        group: vi.fn().mockResolvedValue(42),
        move: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([
          { id: 3, index: 10, windowId: 1 },
          { id: 1, index: 2, windowId: 1 },
          { id: 2, index: 7, windowId: 1 },
        ]),
      },
    })

    await createOrUpdateGroup(1, 'Work', 'blue', [3, 1, 2])

    expect(chromeMock.tabs.move).toHaveBeenCalledWith([3, 1, 2], { index: 2 })
  })

  it('joins the existing group instead of creating a new one', async () => {
    const chromeMock = installChromeMock({
      tabGroups: {
        query: vi.fn().mockResolvedValue([{ id: 99, title: 'Work' }]),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })

    await createOrUpdateGroup(1, 'Work', 'blue', [3, 1, 2])

    expect(chromeMock.tabs.group).toHaveBeenCalledWith({
      tabIds: [3, 1, 2],
      groupId: 99,
    })
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(99, {
      title: 'Work',
      color: 'blue',
    })
    expect(chromeMock.tabs.move).toHaveBeenCalledWith([3, 1, 2], { index: 5 })
  })

  it('returns early when tabIds is empty and does not call any chrome API', async () => {
    const chromeMock = installChromeMock()

    const result = await createOrUpdateGroup(1, 'Work', 'blue', [])

    expect(result).toBe(-1)
    expect(chromeMock.tabs.group).not.toHaveBeenCalled()
    expect(chromeMock.tabs.move).not.toHaveBeenCalled()
  })

})
