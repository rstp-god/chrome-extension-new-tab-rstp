import { todoIntegrationRegistry } from '@/widgets/Todo/integrations/index.ts'
import { describe, expect, it } from 'vitest'
import enSearch from '@/i18n/resources/en/widgets/searchWidget.json'
import ruSearch from '@/i18n/resources/ru/widgets/searchWidget.json'
import enTodo from '@/i18n/resources/en/widgets/todoWidget.json'
import ruTodo from '@/i18n/resources/ru/widgets/todoWidget.json'
import enChromeLibrary from '@/i18n/resources/en/widgets/chromeLibraryWidget.json'
import ruChromeLibrary from '@/i18n/resources/ru/widgets/chromeLibraryWidget.json'
import enProductivity from '@/i18n/resources/en/widgets/productivityWidget.json'
import ruProductivity from '@/i18n/resources/ru/widgets/productivityWidget.json'

/**
 * i18next's plural suffixes. A pluralised string is one key with as many
 * forms as the language has categories — English needs two, Russian three —
 * so comparing the raw leaves would report every plural as a divergence.
 * They collapse to the family name instead, which is what the call site
 * actually asks for.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function keyset(value: Record<string, unknown>, prefix = ''): string[] {
  const keys = Object.entries(value).flatMap(([key, nested]) => {
    const full = prefix ? `${prefix}.${key}` : key
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return keyset(nested as Record<string, unknown>, full)
    }
    return [full.replace(PLURAL_SUFFIX, '')]
  })
  // The families are adjacent in the file, so a pass that drops a repeat of
  // the previous key keeps the order the comparison relies on.
  return keys.filter((key, index) => key !== keys[index - 1])
}

/** Reads a dotted path, or `undefined` when any step is missing. */
function leaf(value: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, step) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[step] : undefined,
      value,
    )
}

/**
 * Leaves the shared UI reads through a key it builds from the integration's
 * name (`integrations.${name}.summary.boardLabel`, …). A missing one is
 * invisible to the parity test above — both locales are equally silent about
 * a namespace nobody wrote — and shows up in the UI as the raw key.
 */
const TEMPLATED_LEAVES = [
  'connect.title',
  'connect.description',
  // The dialog's own header at the scope and mapping steps, whoever renders
  // their bodies.
  'board.title',
  'board.description',
  'mapping.title',
  'summary.title',
  'summary.lastSync',
  'summary.neverSynced',
  'summary.disconnect',
  'summary.disconnectConfirm',
  'summary.switch',
  'summary.switchConfirm',
]

/**
 * Leaves only the **shared** steps read: the generic scope picker's select and
 * empty state, and the generic summary's board line, mapping table and
 * "change the scope" button.
 *
 * A descriptor that brings its own `ScopeStep` or `SummaryExtras` replaces
 * those screens, so requiring the strings would be requiring copy nothing can
 * render — dead translations that still have to be kept in two locales. They
 * are required of every other descriptor, which is where the shared UI is the
 * whole UI.
 */
const GENERIC_UI_LEAVES = [
  'board.pickLabel',
  'board.empty',
  'summary.boardLabel',
  'summary.mappingLabel',
  'summary.rePickBoard',
]

describe('i18n contract', () => {
  it('keeps en and ru search widget keys in sync', () => {
    expect(keyset(ruSearch)).toEqual(keyset(enSearch))
  })

  it('keeps en and ru todo widget keys in sync', () => {
    expect(keyset(ruTodo)).toEqual(keyset(enTodo))
  })

  it('keeps en and ru chromeLibrary widget keys compatible', () => {
    const enKeys = new Set(keyset(enChromeLibrary))
    const ruKeys = new Set(keyset(ruChromeLibrary))
    for (const key of enKeys) {
      expect(ruKeys.has(key)).toBe(true)
    }
  })

  it('keeps en and ru productivity widget keys in sync', () => {
    expect(keyset(ruProductivity)).toEqual(keyset(enProductivity))
  })

  describe.each(Object.keys(todoIntegrationRegistry))(
    'todo integration "%s"',
    (integrationName) => {
      const descriptor = todoIntegrationRegistry[integrationName]
      const bringsOwnUi = Boolean(descriptor.ScopeStep) || Boolean(descriptor.SummaryExtras)

      it.each(TEMPLATED_LEAVES)('has integrations.<name>.%s in both locales', (path) => {
        const full = `integrations.${integrationName}.${path}`
        expect(leaf(enTodo, full), `missing in en: ${full}`).toEqual(expect.any(String))
        expect(leaf(ruTodo, full), `missing in ru: ${full}`).toEqual(expect.any(String))
      })

      it.skipIf(bringsOwnUi).each(GENERIC_UI_LEAVES)(
        'has integrations.<name>.%s for the shared steps it renders',
        (path) => {
          const full = `integrations.${integrationName}.${path}`
          expect(leaf(enTodo, full), `missing in en: ${full}`).toEqual(expect.any(String))
          expect(leaf(ruTodo, full), `missing in ru: ${full}`).toEqual(expect.any(String))
        },
      )
    },
  )
})
