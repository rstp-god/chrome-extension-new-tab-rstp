/**
 * A fixed-size worker pool over a list, for the sync's push phase.
 *
 * `Promise.all` over every item would be the short version and the wrong one:
 * it puts a whole board's worth of requests on someone's self-hosted instance
 * at once. `limit` workers pull from a shared cursor instead, so the number in
 * flight is bounded while the list is still drained in order.
 */

/**
 * Runs `fn` over every item with at most `limit` calls in flight, and answers
 * the results **in the order of `items`** — not in completion order, so a
 * caller can still match a result to the item it came from by index.
 *
 * `limit` of 1 is exactly a sequential `for` loop (the default for a backend
 * that has not opted into more), and a non-positive or non-integer limit
 * degrades to 1 rather than to "unbounded".
 *
 * `fn` is expected to answer rather than throw — the callers here deal in
 * result objects. A rejection is not swallowed: it propagates, and the calls
 * already in flight are not cancelled, because a promise cannot be.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  if (items.length === 0) return results

  const workers = Math.min(Math.max(Math.floor(limit) || 1, 1), items.length)
  // One cursor shared by every worker: whoever finishes first takes the next
  // item, so one slow call cannot idle the others behind it.
  let cursor = 0

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workers }, run))
  return results
}
