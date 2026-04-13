type BackgroundMessage = { type: 'APPLY_NOW' } | { type: 'UNGROUP_ALL' } | { type: 'GET_STATUS' }

export function sendBackgroundMessage(message: BackgroundMessage): void {
  chrome.runtime?.sendMessage?.(message)
}
