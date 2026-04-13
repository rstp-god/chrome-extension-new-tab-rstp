import type { TabRulesSettings } from '@/popup/types/rules.ts'

import { executePipelineAndApply } from '@/background/pipelineExecutor.ts'
import { ungroupAll } from '@/background/chromeAdapter.ts'

type BackgroundMessage = { type: 'APPLY_NOW' } | { type: 'UNGROUP_ALL' } | { type: 'GET_STATUS' }

export function setupMessageHandler(getSettings: () => TabRulesSettings | null) {
  chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'APPLY_NOW': {
        const settings = getSettings()
        if (settings) {
          executePipelineAndApply(settings).then(
            () => sendResponse({ ok: true }),
            (err) => sendResponse({ ok: false, error: String(err) }),
          )
        } else {
          sendResponse({ ok: false, error: 'No settings loaded' })
        }
        return true
      }

      case 'UNGROUP_ALL': {
        ungroupAll().then(
          () => sendResponse({ ok: true }),
          (err) => sendResponse({ ok: false, error: String(err) }),
        )
        return true
      }

      case 'GET_STATUS': {
        const settings = getSettings()
        sendResponse({
          ok: true,
          enabled: settings?.enabled ?? false,
          mode: settings?.automation.mode ?? 'manual',
        })
        return false
      }
    }
  })
}
