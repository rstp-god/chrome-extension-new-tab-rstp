import { Synced, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { DEFAULT_HEADER_SETTINGS, HEADER_SETTINGS_KEY, HeaderSettingsV1 } from '@/types/header.ts'
import i18n from '@/i18n'
import { applyTheme } from '@/utils/theme.ts'
import { z } from 'zod'
import { create } from 'zustand/react'

interface HeaderStore extends HeaderSettingsV1 {
  setDisplayName: (v: string | null) => void
  toggleTheme: () => void
  togglePinned: () => void
  setLanguage: (language: 'en' | 'ru') => void
}

const headerStateSchema = z.object({
  version: z.literal(1),
  displayName: z.string().nullable(),
  theme: z.union([z.literal('light'), z.literal('dark')]),
  pinned: z.boolean(),
  language: z.union([z.literal('en'), z.literal('ru')]).default('en'),
})

const headerEnvelopeSchema = makeEnvelopeSchema(headerStateSchema)

export const useHeaderStore = create<Synced<HeaderStore>>()(
  withChromeSync<HeaderStore, HeaderSettingsV1>({
    key: HEADER_SETTINGS_KEY,
    // Discrete toggles (theme/language/pinned/name) — no high-frequency writes,
    // so no debounce: persist immediately (a delayed write could be lost if the
    // tab is closed/reloaded right after a change). Dedup skips no-op writes.
    area: 'sync',
    schema: headerEnvelopeSchema,
    partialize: (s) => ({
      version: 1,
      displayName: s.displayName,
      theme: s.theme,
      pinned: s.pinned,
      language: s.language,
    }),
    merge: (_cur, incoming) => {
      applyTheme(incoming.theme)
      i18n.changeLanguage(incoming.language)
      return incoming
    },
  })((setState, getState) => ({
    ...DEFAULT_HEADER_SETTINGS,

    setDisplayName: (v) => setState({ displayName: v && v.trim() ? v : null }),
    toggleTheme: () => {
      const res = getState().theme === 'dark' ? 'light' : 'dark'
      applyTheme(res)
      setState({ theme: res })
    },
    togglePinned: () => setState({ pinned: !getState().pinned }),
    setLanguage: (language) => {
      i18n.changeLanguage(language)
      setState({ language })
    },
  })),
)
