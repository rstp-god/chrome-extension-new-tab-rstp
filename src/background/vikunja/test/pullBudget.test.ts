import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handlePull } from '@/background/vikunja/handlers.ts'
import { snapshotBudgetBytes } from '@/background/vikunja/cache.ts'
import { runPull } from '@/background/vikunja/pull.ts'

import type { VikunjaWire } from '@/background/vikunja/messages.ts'

/**
 * How many boards the *page* says share the connection's snapshot budget.
 *
 * The alarm counts the schedule itself; a pull asked for by a widget is about
 * one view, so the request has to carry the count or the worker would write
 * that board a whole board's cap and blow the total the alarm divided.
 *
 * `runPull` is mocked here on purpose: what is under test is the arithmetic
 * between the request and the option, and the real pull would need an
 * instance, a permission grant and a clock.
 */
vi.mock('@/background/vikunja/pull.ts', () => ({
  runPull: vi.fn(async () => ({ ok: true, value: { tasks: [], pulledAt: 1 } })),
}))

const CFG: VikunjaWire = { baseUrl: 'https://vikunja.example', token: 'tk_super-secret-value' }

function request(boardCount?: unknown) {
  return {
    type: 'vikunja' as const,
    op: 'pull' as const,
    cfg: CFG,
    projectId: 1,
    viewId: 4,
    ...(boardCount === undefined ? {} : { boardCount: boardCount as number }),
  }
}

/** The `boardCount` the handler passed on to `runPull`. */
function forwarded(): number | undefined {
  const mocked = vi.mocked(runPull)
  return mocked.mock.calls[0]?.[3]?.boardCount
}

beforeEach(() => {
  vi.mocked(runPull).mockClear()
})

describe('handlePull — the snapshot budget the page asked for', () => {
  it('forwards the count the widget sent', async () => {
    await handlePull(request(3))

    expect(forwarded()).toBe(3)
  })

  it('reads a missing count as one board, which is the per-board cap', async () => {
    await handlePull(request())

    expect(forwarded()).toBe(1)
  })

  it.each([0, -2, 1.5, Number.NaN, 'many', null])(
    'refuses %p and falls back to one board',
    async (junk) => {
      await handlePull(request(junk))

      expect(forwarded()).toBe(1)
    },
  )

  it('lets a count only shrink the budget, never grow it', () => {
    // The fallback is the ceiling: whatever a caller claims, one board's
    // share is the most any snapshot may take.
    const cap = snapshotBudgetBytes(1)
    expect(snapshotBudgetBytes(undefined)).toBe(cap)
    expect(snapshotBudgetBytes(0)).toBe(cap)
    expect(snapshotBudgetBytes(4)).toBeLessThan(cap)
  })
})
