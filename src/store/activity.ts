import { create } from 'zustand/react'

import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import { DEFAULT_ACTIVITY_SETTINGS } from '@/background/activity/defaults.ts'
import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import type { Synced } from '@/services/chrome/zustandChromeSync.ts'
import { activitySettingsEnvelope } from '@/services/zod/activitySchemas.ts'

import type { ActivitySettings, ScreenTimeSettings } from '@/background/activity/types.ts'

/**
 * Activity **settings** store — Pause toggle + per-widget preferences.
 *
 * UI owns this key (`activity_settings`). The background worker reads it via
 * `initActivitySettings`/`getActivitySettings` and subscribes to
 * `chrome.storage.onChanged` so a `paused` toggle takes effect immediately in
 * the worker (no extension reload required).
 *
 * Writes are debounced (250 ms) so dragging a slider or color picker doesn't
 * burn through `chrome.storage.local` write quotas.
 *
 * Read-only snapshot stores for day/week/all live in `./activity.snapshots.ts`.
 */

const SETTINGS_DEBOUNCE_MS = 250

/** Patch type for screen-time updates; `chartPalette` replaces wholesale. */
type ScreenTimePatch = Partial<ScreenTimeSettings>

interface ActivityStore extends ActivitySettings {
  togglePause: () => void
  setPaused: (paused: boolean) => void
  updateScreenTimeSettings: (patch: ScreenTimePatch) => void
  resetActivityDefaults: () => void
}

export const useActivityStore = create<Synced<ActivityStore>>()(
  withChromeSync<ActivityStore, ActivitySettings>({
    key: ACTIVITY_KEYS.settings,
    schema: activitySettingsEnvelope,
    partialize: (s) => ({
      paused: s.paused,
      screenTime: s.screenTime,
    }),
    merge: (_cur, incoming) => incoming,
    debounceMs: SETTINGS_DEBOUNCE_MS,
  })((setState) => ({
    ...DEFAULT_ACTIVITY_SETTINGS,

    togglePause: () => setState((s) => ({ paused: !s.paused })),

    setPaused: (paused) => setState({ paused }),

    updateScreenTimeSettings: (patch) =>
      setState((s) => ({ screenTime: { ...s.screenTime, ...patch } })),

    resetActivityDefaults: () => setState({ ...DEFAULT_ACTIVITY_SETTINGS }),
  })),
)
