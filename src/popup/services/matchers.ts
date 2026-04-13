import type { GroupingRule } from '@/popup/types/rules.ts'

function matchDomain(url: string, pattern: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2)
    return hostname === suffix || hostname.endsWith('.' + suffix)
  }

  return hostname === pattern
}

function matchRegex(url: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(url)
  } catch {
    return false
  }
}

function matchTitleContains(title: string, pattern: string): boolean {
  return title.toLowerCase().includes(pattern.toLowerCase())
}

function matchPathContains(url: string, pattern: string): boolean {
  try {
    const path = new URL(url).pathname
    return path.includes(pattern)
  } catch {
    return false
  }
}

export function matchRule(tab: { url?: string; title?: string }, rule: GroupingRule): boolean {
  if (!rule.enabled) return false

  const url = tab.url ?? ''
  const title = tab.title ?? ''

  switch (rule.matcher.type) {
    case 'domain':
      return matchDomain(url, rule.matcher.value)
    case 'regex':
      return matchRegex(url, rule.matcher.value)
    case 'title_contains':
      return matchTitleContains(title, rule.matcher.value)
    case 'path_contains':
      return matchPathContains(url, rule.matcher.value)
  }
}

export function findMatchingRule(
  tab: { url?: string; title?: string },
  rules: GroupingRule[],
): GroupingRule | null {
  return rules.find((rule) => matchRule(tab, rule)) ?? null
}
