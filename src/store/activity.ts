import { create } from 'zustand/react'

import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import { DEFAULT_ACTIVITY_SETTINGS } from '@/background/activity/defaults.ts'
import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import type { Synced } from '@/services/chrome/zustandChromeSync.ts'
import { activitySettingsEnvelope } from '@/services/zod/activitySchemas.ts'

import type {
  ActivitySettings,
  ChartPalette,
  ScreenTimeSettings,
  TabStatsSettings,
} from '@/background/activity/types.ts'

/**
 * Activity **settings** store — Pause toggle, chart palette, widget prefs.
 *
 * UI owns this key (`activity_settings`). The background worker reads it
 * via `initActivitySettings`/`getActivitySettings` and subscribes to
 * `chrome.storage.onChanged` so a `paused` toggle here takes effect
 * immediately in the worker (no extension reload required).
 *
 * Writes are debounced (250 ms) so dragging a slider or color picker
 * doesn't burn through `chrome.storage.local` write quotas.
 *
 * Read-only snapshot stores for day/week/all live in `./activity.snapshots.ts`.
 */

const SETTINGS_DEBOUNCE_MS = 250

/**
 * Patch type for tab-stats updates. `visibleMetrics` deep-merges, so callers
 * can flip a single flag without re-supplying the whole record.
 */
type TabStatsPatch = Partial<Omit<TabStatsSettings, 'visibleMetrics'>> & {
  visibleMetrics?: Partial<TabStatsSettings['visibleMetrics']>
}

interface ActivityStore extends ActivitySettings {
  togglePause: () => void
  setPaused: (paused: boolean) => void
  setChartPalette: (palette: ChartPalette) => void
  updateScreenTimeSettings: (patch: Partial<ScreenTimeSettings>) => void
  updateTabStatsSettings: (patch: TabStatsPatch) => void
  resetActivityDefaults: () => void
}

export const useActivityStore = create<Synced<ActivityStore>>()(
  withChromeSync<ActivityStore, ActivitySettings>({
    key: ACTIVITY_KEYS.settings,
    schema: activitySettingsEnvelope,
    partialize: (s) => ({
      paused: s.paused,
      chartPalette: s.chartPalette,
      screenTime: s.screenTime,
      tabStats: s.tabStats,
    }),
    merge: (_cur, incoming) => incoming,
    debounceMs: SETTINGS_DEBOUNCE_MS,
  })((setState) => ({
    ...DEFAULT_ACTIVITY_SETTINGS,

    togglePause: () => setState((s) => ({ paused: !s.paused })),

    setPaused: (paused) => setState({ paused }),

    setChartPalette: (chartPalette) => setState({ chartPalette }),

    updateScreenTimeSettings: (patch) =>
      setState((s) => ({ screenTime: { ...s.screenTime, ...patch } })),

    updateTabStatsSettings: (patch) =>
      setState((s) => ({
        tabStats: {
          ...s.tabStats,
          ...patch,
          // Deep-merge `visibleMetrics` so callers can pass a partial record
          // (e.g. `{ visibleMetrics: { peakOpen: true } }`) without wiping
          // the other flags.
          visibleMetrics: patch.visibleMetrics
            ? { ...s.tabStats.visibleMetrics, ...patch.visibleMetrics }
            : s.tabStats.visibleMetrics,
        },
      })),

    resetActivityDefaults: () => setState({ ...DEFAULT_ACTIVITY_SETTINGS }),
  })),
)
