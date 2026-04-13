import { isProcessableTab, isSystemTab } from '@/popup/utils/filter.ts'
import { describe, expect, it } from 'vitest'

describe('isSystemTab', () => {
  it('returns true for chrome:// URLs', () => {
    expect(isSystemTab('chrome://settings')).toBe(true)
    expect(isSystemTab('chrome://extensions')).toBe(true)
  })

  it('returns true for chrome-extension:// URLs', () => {
    expect(isSystemTab('chrome-extension://abc123/popup.html')).toBe(true)
  })

  it('returns true for devtools:// URLs', () => {
    expect(isSystemTab('devtools://devtools/bundled/inspector.html')).toBe(true)
  })

  it('returns true for edge:// URLs', () => {
    expect(isSystemTab('edge://settings')).toBe(true)
  })

  it('returns true for about:blank', () => {
    expect(isSystemTab('about:blank')).toBe(true)
  })

  it('returns true for undefined URL', () => {
    expect(isSystemTab(undefined)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isSystemTab('')).toBe(true)
  })

  it('returns false for regular https URLs', () => {
    expect(isSystemTab('https://github.com')).toBe(false)
    expect(isSystemTab('https://google.com/search?q=test')).toBe(false)
  })

  it('returns false for http URLs', () => {
    expect(isSystemTab('http://localhost:3000')).toBe(false)
  })
})

describe('isProcessableTab', () => {
  function makeTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
    return {
      id: 1,
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: false,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      frozen: false,
      groupId: -1,
      url: 'https://example.com',
      ...overrides,
    }
  }

  it('returns true for regular tabs', () => {
    expect(isProcessableTab(makeTab())).toBe(true)
  })

  it('returns false for pinned tabs', () => {
    expect(isProcessableTab(makeTab({ pinned: true }))).toBe(false)
  })

  it('returns false for system tabs', () => {
    expect(isProcessableTab(makeTab({ url: 'chrome://settings' }))).toBe(false)
  })

  it('returns false for tabs without URL', () => {
    expect(isProcessableTab(makeTab({ url: undefined }))).toBe(false)
  })
})
