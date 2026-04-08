import { describe, expect, it } from 'vitest'
import {
  filterBookmarks,
  filterGroups,
  getFaviconUrl,
  toBreadcrumb,
} from '@/widgets/ChromeLibrary/services/chromeLibrary.ts'
import { bookmarksFixture, groupsFixture } from '@tests/fixtures/chromeLibrary.ts'

describe('chromeLibrary widget service', () => {
  it('filters groups by query', () => {
    expect(filterGroups(groupsFixture, 'git')).toHaveLength(1)
    expect(filterGroups(groupsFixture, 'missing')).toHaveLength(0)
  })

  it('filters bookmarks by query', () => {
    expect(filterBookmarks(bookmarksFixture, 'react')).toHaveLength(1)
  })

  it('builds helpers', () => {
    expect(toBreadcrumb(['A', 'B'])).toBe('A / B')
    expect(getFaviconUrl('https://example.com')).toContain('domain_url=')
  })
})
