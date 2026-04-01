export const CHROME_TAB_EVENTS = [
  chrome.tabs?.onCreated,
  chrome.tabs?.onRemoved,
  chrome.tabs?.onUpdated,
  chrome.tabs?.onMoved,
  chrome.tabs?.onAttached,
  chrome.tabs?.onDetached,
  chrome.tabs?.onActivated,
]

export const CHROME_TAB_GROUP_EVENTS = [
  chrome.tabGroups?.onCreated,
  chrome.tabGroups?.onRemoved,
  chrome.tabGroups?.onUpdated,
  chrome.tabGroups?.onMoved,
]

export const CHROME_BOOKMARK_EVENTS = [
  chrome.bookmarks?.onCreated,
  chrome.bookmarks?.onRemoved,
  chrome.bookmarks?.onChanged,
  chrome.bookmarks?.onMoved,
  chrome.bookmarks?.onChildrenReordered,
  chrome.bookmarks?.onImportEnded,
]
