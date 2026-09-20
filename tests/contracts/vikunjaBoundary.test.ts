import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Architectural guard for the New Tab ↔ service worker bridge.
 *
 * `src/background/vikunja/messages.ts` is the single shared module between
 * the worker and the Todo widget. Anything else crossing that line drags
 * React/Zustand code into the worker bundle (or `chrome.runtime` plumbing
 * into the widget), which is exactly what the bridge exists to avoid. This
 * test reads the sources and fails on the first illegal import.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(ROOT, 'src')

const BACKGROUND_VIKUNJA = path.join(SRC, 'background/vikunja')
const WIDGET_VIKUNJA = path.join(SRC, 'widgets/Todo/integrations/vikunja')

const SHARED_MODULE = path.join(SRC, 'background/vikunja/messages')
const BACKGROUND_ROOT = path.join(SRC, 'background')
const WIDGETS_ROOT = path.join(SRC, 'widgets')

const IMPORT_RE = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listSourceFiles(full)
      return /\.tsx?$/.test(entry.name) ? [full] : []
    })
    .sort()
}

/**
 * Drops block comments and whole-line `//` comments so prose about the
 * boundary is not mistaken for an import. Trailing `//` is left alone on
 * purpose — stripping it would eat URLs such as `https://…`.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function readImports(file: string): string[] {
  const source = stripComments(fs.readFileSync(file, 'utf8'))
  return [...source.matchAll(IMPORT_RE)].map((match) => match[1])
}

/** Absolute, extension-less target of an import, or `null` for a bare package. */
function resolveSpecifier(file: string, specifier: string): string | null {
  let absolute: string
  if (specifier.startsWith('@/')) {
    absolute = path.join(SRC, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    absolute = path.resolve(path.dirname(file), specifier)
  } else {
    return null
  }

  return absolute.replace(/\.(ts|tsx|js|jsx)$/, '')
}

function isInside(target: string, dir: string): boolean {
  return target === dir || target.startsWith(`${dir}${path.sep}`)
}

function relative(file: string): string {
  return path.relative(ROOT, file)
}

function violations(dir: string, isIllegal: (target: string) => boolean) {
  return listSourceFiles(dir).flatMap((file) =>
    readImports(file)
      .map((specifier) => ({ specifier, target: resolveSpecifier(file, specifier) }))
      .filter(({ target }) => target !== null && isIllegal(target))
      .map(({ specifier }) => `${relative(file)} imports '${specifier}'`),
  )
}

describe('vikunja bridge import boundary', () => {
  it('scans both sides of the bridge', () => {
    expect(listSourceFiles(BACKGROUND_VIKUNJA).length).toBeGreaterThan(0)
    expect(listSourceFiles(WIDGET_VIKUNJA).length).toBeGreaterThan(0)
  })

  it('the worker side never imports widget code', () => {
    expect(violations(BACKGROUND_VIKUNJA, (target) => isInside(target, WIDGETS_ROOT))).toEqual([])
  })

  it('the widget side imports nothing from the worker but messages.ts', () => {
    expect(
      violations(
        WIDGET_VIKUNJA,
        (target) => isInside(target, BACKGROUND_ROOT) && target !== SHARED_MODULE,
      ),
    ).toEqual([])
  })
})
