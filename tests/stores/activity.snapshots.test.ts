import { beforeEach, describe, expect, it } from 'vitest'

import type {
  ActivityAllSnapshot,
  ActivityDaySnapshot,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'
import {
  useActivityAllStore,
  useActivityDayStore,
  useActivityWeekStore,
} from '@/store/activity.snapshots.ts'

/**
 * The snapshot stores are read-only to the UI — the worker writes via
 * chrome.storage, and `withChromeSync` propagates via `onChanged`. We can't
 * easily simulate `chrome.storage.onChanged` here because the listener binds
 * at module-import time (before vitest can stub the global). Instead we
 * verify the shape/merge contract directly via `setState`, which is what
 * `onChanged → merge()` ends up doing internally.
 */

describe('useActivityDayStore', () => {
  beforeEach(() => {
    useActivityDayStore.setState({ snapshot: null })
  })

  it('starts with a null snapshot', () => {
    expect(useActivityDayStore.getState().snapshot).toBeNull()
  })

  it('accepts a day snapshot and exposes it', () => {
    const snap: ActivityDaySnapshot = {
      date: '2026-04-16',
      buckets: [],
      totalsByDomain: { 'github.com': { totalTime: 120, visits: 1 } },
    }
    useActivityDayStore.setState({ snapshot: snap })
    expect(useActivityDayStore.getState().snapshot).toEqual(snap)
  })
})

describe('useActivityWeekStore', () => {
  beforeEach(() => {
    useActivityWeekStore.setState({ snapshot: null })
  })

  it('starts with a null snapshot', () => {
    expect(useActivityWeekStore.getState().snapshot).toBeNull()
  })

  it('accepts a week snapshot', () => {
    const snap: ActivityWeekSnapshot = {
      weekStart: '2026-04-13',
      buckets: [],
      totalsByDomain: {},
    }
    useActivityWeekStore.setState({ snapshot: snap })
    expect(useActivityWeekStore.getState().snapshot).toEqual(snap)
  })
})

describe('useActivityAllStore', () => {
  beforeEach(() => {
    useActivityAllStore.setState({ snapshot: null })
  })

  it('starts with a null snapshot', () => {
    expect(useActivityAllStore.getState().snapshot).toBeNull()
  })

  it('accepts an all-snapshot with up to 90 daily buckets', () => {
    const snap: ActivityAllSnapshot = {
      buckets: [
        {
          key: '2026-04-14',
          domains: {},
          tabs: { created: 0, closed: 0, peakOpen: 0, avgLifetime: 0, timedCloses: 0 },
        },
      ],
    }
    useActivityAllStore.setState({ snapshot: snap })
    expect(useActivityAllStore.getState().snapshot).toEqual(snap)
  })
})

describe('snapshot stores are isolated', () => {
  it('updating day does not touch week or all', () => {
    useActivityDayStore.setState({ snapshot: null })
    useActivityWeekStore.setState({ snapshot: null })
    useActivityAllStore.setState({ snapshot: null })

    useActivityDayStore.setState({
      snapshot: {
        date: '2026-04-16',
        buckets: [],
        totalsByDomain: {},
      },
    })

    expect(useActivityDayStore.getState().snapshot).not.toBeNull()
    expect(useActivityWeekStore.getState().snapshot).toBeNull()
    expect(useActivityAllStore.getState().snapshot).toBeNull()
  })
})
