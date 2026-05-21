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

  it('updateScreenTimeSettings can replace chartPalette', () => {
    const palette = {
      baseHex: '#FF0055',
      shades: ['a', 'b', 'c', 'd', 'e'],
    }
    useActivityStore.getState().updateScreenTimeSettings({ chartPalette: palette })
    expect(useActivityStore.getState().screenTime.chartPalette).toEqual(palette)
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

  it('resetActivityDefaults restores DEFAULT_ACTIVITY_SETTINGS', () => {
    useActivityStore.getState().setPaused(true)
    useActivityStore.getState().updateScreenTimeSettings({ chartType: 'area' })
    useActivityStore.getState().resetActivityDefaults()
    expect(useActivityStore.getState().paused).toBe(false)
    expect(useActivityStore.getState().screenTime).toEqual(DEFAULT_ACTIVITY_SETTINGS.screenTime)
  })
})
