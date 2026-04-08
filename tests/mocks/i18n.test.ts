import { describe, expect, it } from 'vitest'
import { createI18nModuleMock } from './i18n';

describe('createI18nModuleMock', () => {
  it('returns react-i18next compatible mock', () => {
    const mockedModule = createI18nModuleMock()
    expect(typeof mockedModule.useTranslation).toBe('function')
    expect(mockedModule.useTranslation().t('demo.key')).toBe('demo.key')
  })
})
