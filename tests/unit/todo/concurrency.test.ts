import { describe, expect, it } from 'vitest'

import { mapWithConcurrency } from '@/widgets/Todo/utils/concurrency.ts'

/** A promise plus the handle to settle it from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('mapWithConcurrency', () => {
  it('answers in input order, whatever the completion order', async () => {
    const out = await mapWithConcurrency([30, 20, 10], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })

    expect(out).toEqual([30, 20, 10])
  })

  it('is a plain sequential loop at a limit of 1', async () => {
    const inFlight: number[] = []
    let peak = 0

    await mapWithConcurrency([1, 2, 3, 4], 1, async (item) => {
      inFlight.push(item)
      peak = Math.max(peak, inFlight.length)
      await flush()
      inFlight.pop()
      return item
    })

    expect(peak).toBe(1)
  })

  it('keeps at most `limit` calls in flight', async () => {
    const gates = [0, 1, 2, 3, 4].map(() => deferred<void>())
    const started: number[] = []

    const pending = mapWithConcurrency([0, 1, 2, 3, 4], 2, async (index) => {
      started.push(index)
      await gates[index].promise
      return index
    })

    await flush()
    expect(started).toEqual([0, 1])

    gates[0].resolve()
    await flush()
    // One slot freed, one more item picked up — not two.
    expect(started).toEqual([0, 1, 2])

    for (const gate of gates) gate.resolve()
    await expect(pending).resolves.toEqual([0, 1, 2, 3, 4])
  })

  it('does not idle the pool behind one slow call', async () => {
    const slow = deferred<void>()
    const finished: number[] = []

    const pending = mapWithConcurrency([0, 1, 2], 2, async (index) => {
      if (index === 0) await slow.promise
      finished.push(index)
      return index
    })

    await flush()
    // 1 and 2 went through while 0 is still waiting.
    expect(finished).toEqual([1, 2])

    slow.resolve()
    await expect(pending).resolves.toEqual([0, 1, 2])
  })

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['fractional below one', 0.5],
    ['NaN', Number.NaN],
  ])('treats a %s limit as one, never as unbounded', async (_label, limit) => {
    let peak = 0
    let live = 0

    await mapWithConcurrency([1, 2, 3], limit, async (item) => {
      live += 1
      peak = Math.max(peak, live)
      await flush()
      live -= 1
      return item
    })

    expect(peak).toBe(1)
  })

  it('handles an empty list without running anything', async () => {
    let calls = 0

    await expect(
      mapWithConcurrency([], 4, async () => {
        calls += 1
      }),
    ).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  it('caps the pool at the number of items', async () => {
    const seen: number[] = []

    await mapWithConcurrency([7], 10, async (item) => {
      seen.push(item)
      return item
    })

    expect(seen).toEqual([7])
  })
})
