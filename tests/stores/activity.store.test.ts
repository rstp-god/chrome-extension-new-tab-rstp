/**
 * @vitest-environment jsdom
 *
 * jsdom is needed because `withChromeSync` uses `window.setTimeout` when
 * `debounceMs > 0` — the activity settings store debounces to 250 ms.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_ACTIVITY_SETTINGS } from '@/background/activity/defaults.ts'
import { useActivityStore } from '@/store/activity.ts'

describe('useActivityStore', () => {
  beforeEach(() => {
    useActivityStore.setState({ ...DEFAULT_ACTIVITY_SETTINGS })
  })

  it('togglePause flips the paused flag', () => {
    expect(useActivityStore.getState().paused).toBe(false)
    useActivityStore.getState().togglePause()
    expect(useActivityStore.getState().paused).toBe(true)
    useActivityStore.getState().togglePause()
    expect(useActivityStore.getState().paused).toBe(false)
  })

  it('setPaused is absolute (not a toggle)', () => {
    useActivityStore.getState().setPaused(true)
    expect(useActivityStore.getState().paused).toBe(true)
    useActivityStore.getState().setPaused(true)
    expect(useActivityStore.getState().paused).toBe(true)
  })

  it('updateScreenTimeSettings can replace chartPalette (per-widget palette)', () => {
    const palette = {
      baseHex: '#FF0055',
      shades: ['a', 'b', 'c', 'd', 'e'],
    }
    useActivityStore.getState().updateScreenTimeSettings({ chartPalette: palette })
    expect(useActivityStore.getState().screenTime.chartPalette).toEqual(palette)
    // Tab Stats palette unaffected — palettes are per-widget.
    expect(useActivityStore.getState().tabStats.chartPalette).toEqual(
      DEFAULT_ACTIVITY_SETTINGS.tabStats.chartPalette,
    )
  })

  it('updateScreenTimeSettings patches only supplied fields', () => {
    useActivityStore.getState().updateScreenTimeSettings({ chartType: 'donut' })
    const state = useActivityStore.getState()
    expect(state.screenTime.chartType).toBe('donut')
    // Other fields preserved.
    expect(state.screenTime.showTopDomains).toBe(
      DEFAULT_ACTIVITY_SETTINGS.screenTime.showTopDomains,
    )
    expect(state.screenTime.maxDomains).toBe(DEFAULT_ACTIVITY_SETTINGS.screenTime.maxDomains)
  })

  it('updateTabStatsSettings patches only supplied fields', () => {
    useActivityStore.getState().updateTabStatsSettings({ format: 'radial' })
    const state = useActivityStore.getState()
    expect(state.tabStats.format).toBe('radial')
    expect(state.tabStats.showSparkline).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.showSparkline)
  })

  it('updateTabStatsSettings deep-merges visibleMetrics without wiping other flags', () => {
    // Pass ONLY the flag we care about — the store must preserve the rest.
    useActivityStore.getState().updateTabStatsSettings({
      visibleMetrics: { peakOpen: true },
    })
    const metrics = useActivityStore.getState().tabStats.visibleMetrics
    expect(metrics.peakOpen).toBe(true)
    expect(metrics.openNow).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.visibleMetrics.openNow)
    expect(metrics.created).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.visibleMetrics.created)
    expect(metrics.closed).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.visibleMetrics.closed)
    expect(metrics.avgLifetime).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.visibleMetrics.avgLifetime)
    expect(metrics.activePct).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.visibleMetrics.activePct)
  })

  it('updateTabStatsSettings merges top-level fields alongside visibleMetrics', () => {
    useActivityStore.getState().updateTabStatsSettings({
      format: 'list',
      visibleMetrics: { activePct: false },
    })
    const tabStats = useActivityStore.getState().tabStats
    expect(tabStats.format).toBe('list')
    expect(tabStats.visibleMetrics.activePct).toBe(false)
    expect(tabStats.visibleMetrics.openNow).toBe(true)
    // showSparkline untouched.
    expect(tabStats.showSparkline).toBe(DEFAULT_ACTIVITY_SETTINGS.tabStats.showSparkline)
  })

  it('resetActivityDefaults restores DEFAULT_ACTIVITY_SETTINGS', () => {
    useActivityStore.getState().setPaused(true)
    useActivityStore.getState().updateScreenTimeSettings({ chartType: 'area' })
    useActivityStore.getState().resetActivityDefaults()
    expect(useActivityStore.getState().paused).toBe(false)
    expect(useActivityStore.getState().screenTime).toEqual(DEFAULT_ACTIVITY_SETTINGS.screenTime)
  })
})
