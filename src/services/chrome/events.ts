import { getChromeObject } from '@/services/chrome/runtime.ts'

const chromeObject = getChromeObject()

export const CHROME_TAB_EVENTS = [
  chromeObject?.tabs?.onCreated,
  chromeObject?.tabs?.onRemoved,
  chromeObject?.tabs?.onUpdated,
  chromeObject?.tabs?.onMoved,
  chromeObject?.tabs?.onAttached,
  chromeObject?.tabs?.onDetached,
  chromeObject?.tabs?.onActivated,
]

export const CHROME_TAB_GROUP_EVENTS = [
  chromeObject?.tabGroups?.onCreated,
  chromeObject?.tabGroups?.onRemoved,
  chromeObject?.tabGroups?.onUpdated,
  chromeObject?.tabGroups?.onMoved,
]

export const CHROME_BOOKMARK_EVENTS = [
  chromeObject?.bookmarks?.onCreated,
  chromeObject?.bookmarks?.onRemoved,
  chromeObject?.bookmarks?.onChanged,
  chromeObject?.bookmarks?.onMoved,
  chromeObject?.bookmarks?.onChildrenReordered,
  chromeObject?.bookmarks?.onImportEnded,
]
