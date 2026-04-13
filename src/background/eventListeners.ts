import type { TabRulesSettings } from '@/popup/types/rules.ts'
import { executePipelineAndApply, isApplying } from '@/background/pipelineExecutor.ts'

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function setupEventListeners(getSettings: () => TabRulesSettings | null) {
  const handleTabEvent = () => {
    // Skip events triggered by our own pipeline execution
    if (isApplying()) return

    const settings = getSettings()
    if (!settings?.enabled) return

    switch (settings.automation.mode) {
      case 'realtime':
        void executePipelineAndApply(settings)
        break

      case 'debounce':
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          void executePipelineAndApply(settings)
        }, settings.automation.debounceMs)
        break

      case 'manual':
        // Do nothing, wait for user to click "Apply now"
        break
    }
  }

  chrome.tabs.onCreated.addListener(handleTabEvent)

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.title) {
      handleTabEvent()
    }
  })

  chrome.tabs.onRemoved.addListener(handleTabEvent)
  chrome.tabs.onMoved.addListener(handleTabEvent)
  chrome.tabs.onAttached.addListener(handleTabEvent)
  chrome.tabs.onDetached.addListener(handleTabEvent)
}
