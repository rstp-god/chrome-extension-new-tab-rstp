/**
 * One promise chain per key — a Vikunja task id, or `project:<id>` for the
 * writes that belong to a project rather than to a task.
 *
 * Every write to a task is a read-modify-write (`GET /tasks/:id` → merge →
 * `POST /tasks/:id`, see `VikunjaClient.updateTask`), and Vikunja has no
 * optimistic locking of its own (`concurrent_writes: true` in `GET /info`).
 * Two such cycles interleaving on the same task means the second one reads the
 * state the first one is about to overwrite: the later `POST` wins and the
 * earlier edit is silently lost. Serialising per task id is what makes the
 * read-modify-write actually atomic from our side.
 *
 * Per **key**, not globally: a board-wide lock would turn a sync of fifty
 * dirty tasks into fifty round trips in a row, and two different tasks cannot
 * race each other — they are separate records. Creates are the exception that
 * needs a coarser key: they have no task id yet and they all compete for the
 * project's `index` / `identifier` counter, so they serialise per project.
 *
 * One rule for callers: a job must not `enqueue` the same key again from
 * inside itself. It would wait for a chain it is itself holding, which never
 * drains. The client's composite operations therefore call the *unqueued*
 * primitives internally (`updateTask` reads through `getTaskRaw`, not through
 * another queued read).
 */

/** What a chain may be keyed by: a task id, or a namespaced string. */
export type MutationKey = number | string

/**
 * Tail of the chain for each key with a write in flight. Settled-only
 * (never carries a rejection), so a failed job cannot break the link that
 * follows it. The entry is dropped once the chain drains, so a long-running
 * worker does not accumulate one promise per task it has ever touched.
 */
const chains = new Map<MutationKey, Promise<void>>()

export function enqueue<T>(key: MutationKey, job: () => Promise<T>): Promise<T> {
  const previous = chains.get(key)
  // Both handlers run `job`: a predecessor that failed has still finished, and
  // its failure belongs to its own caller, not to the next writer in line.
  const next = previous ? previous.then(job, job) : Promise.resolve().then(job)

  const drain = () => {
    // Only the last link clears the entry. A job enqueued while this one was
    // in flight has already replaced the tail, and deleting it here would let
    // the next `enqueue` start a second chain in parallel with it.
    if (chains.get(key) === tail) chains.delete(key)
  }
  const tail = next.then(drain, drain)
  chains.set(key, tail)

  return next
}

/**
 * How many keys currently have a write in flight. Exists for the test that
 * pins the "entry is dropped once the chain drains" rule — nothing in the
 * worker reads it.
 */
export function pendingMutationChains(): number {
  return chains.size
}
