import { markActive } from '@/background/cleanup/activityTracker.ts'

const NOTIFICATION_PREFIX = 'cleanup-tab-'

export function showCleanupNotification(tabId: number, tabTitle: string): void {
  const notificationId = `${NOTIFICATION_PREFIX}${tabId}`

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'public/logo.png',
    title: 'Close inactive tab?',
    message: tabTitle,
    buttons: [{ title: 'Close' }, { title: 'Keep' }],
    requireInteraction: true,
  })
}

export function setupNotificationHandlers(): void {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return

    const tabId = Number(notificationId.slice(NOTIFICATION_PREFIX.length))
    if (Number.isNaN(tabId)) return

    if (buttonIndex === 0) {
      // Close
      chrome.tabs.remove(tabId).catch(() => {
        // Tab might already be closed
      })
    } else {
      // Keep — reset activity timer
      markActive(tabId)
    }

    chrome.notifications.clear(notificationId)
  })
}
