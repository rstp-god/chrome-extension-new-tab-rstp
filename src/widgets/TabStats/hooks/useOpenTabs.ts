import { useEffect, useState } from 'react'

import { getChromeObject } from '@/services/chrome/runtime.ts'

/**
 * Live tab counts across all Chrome windows. Re-queries on every tab
 * create/remove event. In showcase mode (no chrome.*) returns zeros so the
 * widget can still render a sensible shell.
 */
export interface OpenTabsState {
  total: number
  discarded: number
}

export function useOpenTabs(): OpenTabsState {
  const [state, setState] = useState<OpenTabsState>({ total: 0, discarded: 0 })

  useEffect(() => {
    const chromeObject = getChromeObject()
    const tabsApi = chromeObject?.tabs
    if (!tabsApi) return

    let alive = true
    const refresh = async () => {
      try {
        const tabs = await tabsApi.query({})
        if (!alive) return
        setState({
          total: tabs.length,
          discarded: tabs.filter((t) => t.discarded === true).length,
        })
      } catch (err) {
        console.warn('[tab-stats] tabs.query failed', err)
      }
    }

    void refresh()
    const onCreatedOrRemoved = () => void refresh()
    // onUpdated fires for every url/title/favicon/status change on every tab —
    // we only care about discard state flips (changes `activePct`). Filtering
    // prevents burning CPU on rapid tab-load flurries.
    const onUpdated = (
      _id: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
    ) => {
      if (changeInfo.discarded !== undefined) void refresh()
    }
    tabsApi.onCreated.addListener(onCreatedOrRemoved)
    tabsApi.onRemoved.addListener(onCreatedOrRemoved)
    tabsApi.onUpdated.addListener(onUpdated)
    return () => {
      alive = false
      tabsApi.onCreated.removeListener(onCreatedOrRemoved)
      tabsApi.onRemoved.removeListener(onCreatedOrRemoved)
      tabsApi.onUpdated.removeListener(onUpdated)
    }
  }, [])

  return state
}
