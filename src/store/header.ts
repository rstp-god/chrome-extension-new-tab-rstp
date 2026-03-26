
import { Synced, withChromeSync } from '@/services/chrome/zustandChromeSync.ts';
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts';
import { DEFAULT_HEADER_SETTINGS, HEADER_SETTINGS_KEY, HeaderSettingsV1 } from '@/types/header.ts';
import { applyTheme } from '@/utils/theme.ts';
import { z } from 'zod';
import { create } from 'zustand/react';

interface HeaderStore extends HeaderSettingsV1 {
  setDisplayName: (v: string | null) => void;
  toggleTheme: () => void;
  togglePinned: () => void;
}

const headerStateSchema = z.object({
  version: z.literal(1),
  displayName: z.string().nullable(),
  theme: z.union([z.literal("light"), z.literal("dark")]),
  pinned: z.boolean(),
});

const headerEnvelopeSchema = makeEnvelopeSchema(headerStateSchema);

export const useHeaderStore = create<Synced<HeaderStore>>()(
  withChromeSync<HeaderStore, HeaderSettingsV1>({
    key: HEADER_SETTINGS_KEY,
    schema: headerEnvelopeSchema,
    partialize: (s) => ({
      version: 1,
      displayName: s.displayName,
      theme: s.theme,
      pinned: s.pinned,
    }),
    merge: (_cur, incoming) => {
      applyTheme(incoming.theme);
      return incoming;
    },
  })((setState, getState) => ({
    ...DEFAULT_HEADER_SETTINGS,

    setDisplayName: (v) => setState({ displayName: v && v.trim() ? v : null }),
    toggleTheme: () => {
      const res = getState().theme === 'dark' ? 'light' : 'dark';
      applyTheme(res);
      setState({ theme: res });
    },
    togglePinned: () => setState({ pinned: !getState().pinned }),
  }))
);

