import { describe, expect, it } from 'vitest'
import enSearch from '@/i18n/resources/en/widgets/searchWidget.json'
import ruSearch from '@/i18n/resources/ru/widgets/searchWidget.json'
import enTodo from '@/i18n/resources/en/widgets/todoWidget.json'
import ruTodo from '@/i18n/resources/ru/widgets/todoWidget.json'
import enChromeLibrary from '@/i18n/resources/en/widgets/chromeLibraryWidget.json'
import ruChromeLibrary from '@/i18n/resources/ru/widgets/chromeLibraryWidget.json'
import enProductivity from '@/i18n/resources/en/widgets/productivityWidget.json'
import ruProductivity from '@/i18n/resources/ru/widgets/productivityWidget.json'

function keyset(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, nested]) => {
    const full = prefix ? `${prefix}.${key}` : key
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return keyset(nested as Record<string, unknown>, full)
    }
    return [full]
  })
}

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
})
