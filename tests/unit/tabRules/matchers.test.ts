import type { GroupingRule } from '@/popup/types/rules.ts'
import { findMatchingRule, matchRule } from '@/popup/services/matchers.ts'
import { describe, expect, it } from 'vitest'

function makeRule(overrides: Partial<GroupingRule> = {}): GroupingRule {
  return {
    id: 'r1',
    enabled: true,
    matcher: { type: 'domain', value: 'github.com' },
    group: { name: 'Code', color: 'green' },
    ...overrides,
  }
}

function makeTab(url?: string, title?: string) {
  return { url, title }
}

describe('matchRule — domain', () => {
  it('matches exact domain', () => {
    const rule = makeRule({ matcher: { type: 'domain', value: 'github.com' } })
    expect(matchRule(makeTab('https://github.com/repo'), rule)).toBe(true)
  })

  it('does not match different domain', () => {
    const rule = makeRule({ matcher: { type: 'domain', value: 'github.com' } })
    expect(matchRule(makeTab('https://gitlab.com/repo'), rule)).toBe(false)
  })

  it('matches wildcard subdomain', () => {
    const rule = makeRule({ matcher: { type: 'domain', value: '*.google.com' } })
    expect(matchRule(makeTab('https://docs.google.com/doc/1'), rule)).toBe(true)
    expect(matchRule(makeTab('https://mail.google.com/inbox'), rule)).toBe(true)
  })

  it('wildcard also matches the base domain', () => {
    const rule = makeRule({ matcher: { type: 'domain', value: '*.google.com' } })
    expect(matchRule(makeTab('https://google.com'), rule)).toBe(true)
  })

  it('returns false for invalid URL', () => {
    const rule = makeRule({ matcher: { type: 'domain', value: 'github.com' } })
    expect(matchRule(makeTab('not-a-url'), rule)).toBe(false)
  })
})

describe('matchRule — regex', () => {
  it('matches URL by regex', () => {
    const rule = makeRule({ matcher: { type: 'regex', value: 'jira|confluence' } })
    expect(matchRule(makeTab('https://company.atlassian.net/jira/board'), rule)).toBe(true)
  })

  it('does not match non-matching URL', () => {
    const rule = makeRule({ matcher: { type: 'regex', value: 'jira|confluence' } })
    expect(matchRule(makeTab('https://github.com'), rule)).toBe(false)
  })

  it('handles invalid regex gracefully', () => {
    const rule = makeRule({ matcher: { type: 'regex', value: '[invalid(' } })
    expect(matchRule(makeTab('https://example.com'), rule)).toBe(false)
  })
})

describe('matchRule — title_contains', () => {
  it('matches case-insensitively', () => {
    const rule = makeRule({ matcher: { type: 'title_contains', value: 'YouTube' } })
    expect(matchRule(makeTab('https://youtube.com', 'youtube - Home'), rule)).toBe(true)
  })

  it('does not match when title missing', () => {
    const rule = makeRule({ matcher: { type: 'title_contains', value: 'YouTube' } })
    expect(matchRule(makeTab('https://youtube.com'), rule)).toBe(false)
  })
})

describe('matchRule — path_contains', () => {
  it('matches substring in path', () => {
    const rule = makeRule({ matcher: { type: 'path_contains', value: '/pull/' } })
    expect(matchRule(makeTab('https://github.com/org/repo/pull/123'), rule)).toBe(true)
  })

  it('does not match path not containing substring', () => {
    const rule = makeRule({ matcher: { type: 'path_contains', value: '/pull/' } })
    expect(matchRule(makeTab('https://github.com/org/repo/issues/1'), rule)).toBe(false)
  })
})

describe('matchRule — disabled rule', () => {
  it('never matches when disabled', () => {
    const rule = makeRule({ enabled: false })
    expect(matchRule(makeTab('https://github.com'), rule)).toBe(false)
  })
})

describe('findMatchingRule', () => {
  it('returns first matching rule (priority order)', () => {
    const rules = [
      makeRule({ id: 'r1', matcher: { type: 'domain', value: 'github.com' } }),
      makeRule({ id: 'r2', matcher: { type: 'regex', value: 'github' } }),
    ]
    const result = findMatchingRule(makeTab('https://github.com/repo'), rules)
    expect(result?.id).toBe('r1')
  })

  it('returns null when no rules match', () => {
    const rules = [makeRule({ matcher: { type: 'domain', value: 'gitlab.com' } })]
    expect(findMatchingRule(makeTab('https://github.com'), rules)).toBeNull()
  })

  it('skips disabled rules', () => {
    const rules = [
      makeRule({ id: 'r1', enabled: false, matcher: { type: 'domain', value: 'github.com' } }),
      makeRule({ id: 'r2', matcher: { type: 'regex', value: 'github' } }),
    ]
    const result = findMatchingRule(makeTab('https://github.com'), rules)
    expect(result?.id).toBe('r2')
  })
})
