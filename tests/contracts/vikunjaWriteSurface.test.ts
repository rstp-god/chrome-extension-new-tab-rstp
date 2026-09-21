import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Architectural guard for the most dangerous request in the project.
 *
 * `POST /tasks/:id` is a full object **replacement** (recon Q9): a body that
 * omits a field blanks it in the user's own tracker. `VikunjaClient.updateTask`
 * is the one place that gets this right — it reads the task and merges the
 * patch into the raw JSON first — so a second call site anywhere would be a
 * second chance to wipe someone's descriptions and due dates.
 *
 * This test therefore pins the count at one, and checks that no other module
 * under `src/` even looks like it is POSTing to a task path.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(ROOT, 'src')
const CLIENT = path.join(SRC, 'background/vikunja/client.ts')

/**
 * The `POST` whose path is a task path. Tolerates Prettier wrapping the
 * arguments across lines (`\s` matches a newline), and is expressed against
 * `taskPath()` rather than a literal so a hand-built `/tasks/${id}` string
 * elsewhere in the file would *not* satisfy it — it would trip the count.
 */
const POST_TO_TASK = /'POST',\s*this\.taskPath\(/g

/**
 * Every shipped module under a directory. Tests are left out on purpose: they
 * are full of the very strings this file looks for — that is their job — and
 * none of them runs in the extension.
 */
function listSourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'test' ? [] : listSourceFiles(full)
      return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : []
    })
    .sort()
}

/**
 * Drops block comments and whole-line `//` comments, so prose *about* the
 * endpoint (there is a lot of it, and there should be) does not read as a call
 * to it.
 */
function code(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('vikunja write surface', () => {
  it('POSTs to a task path from exactly one call site', () => {
    expect(code(CLIENT).match(POST_TO_TASK)).toHaveLength(1)
  })

  it('that call site lives in updateTask, behind the etag check', () => {
    const source = code(CLIENT)
    const method = source.slice(source.indexOf('updateTask('))
    const call = method.search(POST_TO_TASK)

    expect(call).toBeGreaterThan(0)
    // The conflict return precedes the write: an etag compared afterwards
    // would compare nothing.
    expect(method.indexOf('CONFLICT_FAILURE')).toBeLessThan(call)
  })

  it('no other module under src/ combines a POST with a task path', () => {
    const offenders = listSourceFiles(SRC)
      .filter((file) => file !== CLIENT)
      .filter((file) => {
        const source = code(file)
        return source.includes("'POST'") && source.includes('/tasks/')
      })
      .map((file) => path.relative(ROOT, file))

    expect(offenders).toEqual([])
  })

  it('no widget module asks the worker to delete a task', () => {
    // The widget never destroys a record: `removeTask` moves the task to the
    // `deleted` status, which the push maps onto a bucket (or, in flat mode,
    // onto nothing at all). The `delete` op exists for a caller that means
    // it, and the widget is not one — a stray one here would turn "hide from
    // my list" into "gone from the tracker".
    const offenders = listSourceFiles(path.join(SRC, 'widgets'))
      .filter((file) => /op:\s*'delete'/.test(code(file)))
      .map((file) => path.relative(ROOT, file))

    expect(offenders).toEqual([])
  })

  it('nothing outside the client fetches a Vikunja URL', () => {
    // The worker is the only context that can reach the instance at all
    // (recon Q17), and inside it the client is the only module that may.
    const offenders = listSourceFiles(path.join(SRC, 'background/vikunja'))
      .filter((file) => file !== CLIENT)
      .filter((file) => /\bfetch\s*\(/.test(code(file)))
      .map((file) => path.relative(ROOT, file))

    expect(offenders).toEqual([])
  })
})
