import { describe, expect, it } from 'vitest'

import { enqueue, pendingMutationChains } from '@/background/vikunja/mutationQueue.ts'

/** A promise plus the handles to settle it from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets every already-scheduled microtask run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('enqueue', () => {
  it('runs two jobs on the same task id strictly in order', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const started: string[] = []

    const firstDone = enqueue(1, async () => {
      started.push('first')
      return first.promise
    })
    const secondDone = enqueue(1, async () => {
      started.push('second')
      return second.promise
    })

    await flush()
    // The second job has not even begun: its predecessor holds the chain.
    expect(started).toEqual(['first'])

    first.resolve('a')
    await flush()
    expect(started).toEqual(['first', 'second'])

    second.resolve('b')
    await expect(firstDone).resolves.toBe('a')
    await expect(secondDone).resolves.toBe('b')
  })

  it('lets jobs on different task ids overlap', async () => {
    const first = deferred<string>()
    const started: string[] = []

    const firstDone = enqueue(1, async () => {
      started.push('task-1')
      return first.promise
    })
    const secondDone = enqueue(2, async () => {
      started.push('task-2')
      return 'b'
    })

    await flush()
    // Task 2 ran to completion while task 1 is still pending.
    expect(started).toEqual(['task-1', 'task-2'])
    await expect(secondDone).resolves.toBe('b')

    first.resolve('a')
    await expect(firstDone).resolves.toBe('a')
  })

  it('does not let a rejected job block the next one on the same id', async () => {
    const failing = deferred<string>()
    const started: string[] = []

    const failed = enqueue(3, async () => {
      started.push('failing')
      return failing.promise
    })
    const followUp = enqueue(3, async () => {
      started.push('follow-up')
      return 'ok'
    })

    failing.reject(new Error('boom'))
    await expect(failed).rejects.toThrow('boom')

    await expect(followUp).resolves.toBe('ok')
    expect(started).toEqual(['failing', 'follow-up'])
  })

  it('drops the chain entry once it drains, for both outcomes', async () => {
    expect(pendingMutationChains()).toBe(0)

    const pending = deferred<string>()
    const done = enqueue(4, () => pending.promise)
    expect(pendingMutationChains()).toBe(1)

    pending.resolve('a')
    await done
    await flush()
    expect(pendingMutationChains()).toBe(0)

    await expect(
      enqueue(5, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await flush()
    expect(pendingMutationChains()).toBe(0)
  })
})
