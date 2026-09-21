import { describe, expect, it } from 'vitest'

import enTodo from '@/i18n/resources/en/widgets/todoWidget.json'
import ruTodo from '@/i18n/resources/ru/widgets/todoWidget.json'
import {
  getDialogDescriptionKey,
  getDialogTitleKey,
  type DialogStep,
} from '@/widgets/Todo/utils/dialogStep.ts'

/**
 * Each backend names its own things: Trello picks a *board*, Vikunja picks a
 * *project* and maps *buckets*. The dialog header has to follow the active
 * integration, and every key it can produce has to exist in both locales —
 * a missing one renders as the raw key in the dialog title.
 */

const SCOPED_STEPS: DialogStep[] = ['connect', 'board', 'mapping']

function lookup(resource: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[part]
  }, resource)
}

describe('getDialogTitleKey', () => {
  it('keeps the picker step integration-agnostic', () => {
    expect(getDialogTitleKey('picker', null)).toBe('integrations.picker.title')
    expect(getDialogTitleKey('picker', 'vikunja')).toBe('integrations.picker.title')
  })

  it.each(['trello', 'vikunja'])('scopes every other step to %s', (name) => {
    expect(getDialogTitleKey('connect', name)).toBe(`integrations.${name}.connect.title`)
    expect(getDialogTitleKey('board', name)).toBe(`integrations.${name}.board.title`)
    expect(getDialogTitleKey('mapping', name)).toBe(`integrations.${name}.mapping.title`)
    expect(getDialogTitleKey('summary', name)).toBe(`integrations.${name}.summary.title`)
  })

  it('falls back to the picker wording rather than interpolating a null name', () => {
    for (const step of [...SCOPED_STEPS, 'summary'] as DialogStep[]) {
      expect(getDialogTitleKey(step, null)).toBe('integrations.picker.title')
    }
  })
})

describe('getDialogDescriptionKey', () => {
  it.each(['trello', 'vikunja'])('scopes connect/board/mapping to %s', (name) => {
    for (const step of SCOPED_STEPS) {
      expect(getDialogDescriptionKey(step, name)).toBe(`integrations.${name}.${step}.description`)
    }
  })

  it('keeps the summary description shared across integrations', () => {
    expect(getDialogDescriptionKey('summary', 'trello')).toBe('settings.description')
    expect(getDialogDescriptionKey('summary', 'vikunja')).toBe('settings.description')
  })
})

describe('every key the dialog can ask for exists', () => {
  const steps: DialogStep[] = ['picker', 'connect', 'board', 'mapping', 'summary']

  it.each([
    ['en', enTodo],
    ['ru', ruTodo],
  ])('resolves in %s', (_lang, resource) => {
    for (const name of ['trello', 'vikunja']) {
      for (const step of steps) {
        expect(
          lookup(resource as unknown as Record<string, unknown>, getDialogTitleKey(step, name)),
          `${name}/${step} title`,
        ).toBeTypeOf('string')

        const descriptionKey = getDialogDescriptionKey(step, name)
        // `settings.description` lives outside the `integrations` subtree.
        if (descriptionKey.startsWith('integrations.')) {
          expect(
            lookup(resource as unknown as Record<string, unknown>, descriptionKey),
            `${name}/${step} description`,
          ).toBeTypeOf('string')
        }
      }
    }
  })
})
