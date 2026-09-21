import { describe, expect, it } from 'vitest'

import {
  normalizeVikunjaBaseUrl,
  normalizeVikunjaTimestamp,
  vikunjaHostPattern,
} from '@/background/vikunja/messages.ts'

/**
 * These two functions decide which host the extension may be granted and
 * which URL both sides of the bridge consider "the same instance". A hole
 * here is not a formatting bug: `vikunjaHostPattern` output goes straight
 * into `chrome.permissions.request`.
 */

/**
 * Hosts `new URL()` accepts but a Chrome match pattern reads as a wildcard,
 * plus the bracketed IPv6 form a match pattern cannot express at all.
 */
const WILDCARD_URLS = [
  'https://*',
  'https://%2A',
  'https://*.example.com',
  'https://%2A.example.com',
  'https://[::1]',
  'https://[2001:db8::1]:8443',
]

describe('normalizeVikunjaBaseUrl', () => {
  it.each([
    ['https://vikunja.example', 'https://vikunja.example'],
    ['https://vikunja.example/', 'https://vikunja.example'],
    ['https://vikunja.example///', 'https://vikunja.example'],
    ['https://vikunja.example/api/v1', 'https://vikunja.example'],
    ['https://vikunja.example/api/v1/', 'https://vikunja.example'],
    ['  https://vikunja.example/api/v1  ', 'https://vikunja.example'],
    ['https://vikunja.example:8443/api/v1', 'https://vikunja.example:8443'],
    ['https://host.example/vikunja/api/v1', 'https://host.example/vikunja'],
    ['https://localhost:3000', 'https://localhost:3000'],
    ['https://192.168.1.10', 'https://192.168.1.10'],
    // Case folding: the host comes from `origin`, the suffix match ignores case.
    ['https://API.Example.com:8443/API/V1/', 'https://api.example.com:8443'],
    // A host literally called `api` with a `/v1` path — only the parser can
    // tell this apart from an API root, which is why the raw string is never
    // cut by hand.
    ['https://api/v1', 'https://api/v1'],
    // Repeated suffix, stripped to a fixed point.
    ['https://host.example/api/v1/api/v1', 'https://host.example'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeVikunjaBaseUrl(input)).toBe(expected)
  })

  it.each([
    ['plain http', 'http://vikunja.example'],
    ['credentials', 'https://user:pass@vikunja.example'],
    ['a password only', 'https://:pass@vikunja.example'],
    ['a query string', 'https://vikunja.example/?token=leak'],
    ['a fragment', 'https://vikunja.example/#frag'],
    ['no scheme', 'vikunja.example'],
    ['an empty string', ''],
    ['a non-URL', 'not a url at all'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeVikunjaBaseUrl(input)).toBeNull()
  })

  it.each(WILDCARD_URLS)('rejects the wildcard/IPv6 host %s', (input) => {
    expect(normalizeVikunjaBaseUrl(input)).toBeNull()
  })

  it.each([
    'https://vikunja.example',
    'https://vikunja.example/',
    'https://vikunja.example/api/v1',
    'https://host.example/api/v1/api/v1',
    'https://API.Example.com:8443/API/V1/',
    'https://api/v1',
    'https://host.example/vikunja/',
  ])('is idempotent for %s', (input) => {
    const once = normalizeVikunjaBaseUrl(input)
    expect(once).not.toBeNull()
    if (once === null) return
    // The form persists the first result and the worker re-derives it from
    // that; a second pass that moved would break the permission gate.
    expect(normalizeVikunjaBaseUrl(once)).toBe(once)
  })
})

describe('vikunjaHostPattern', () => {
  it.each([
    ['https://vikunja.example', 'https://vikunja.example/*'],
    // Chrome match patterns carry no port, so the grant is per host.
    ['https://vikunja.example:8443', 'https://vikunja.example/*'],
    ['https://vikunja.example/vikunja', 'https://vikunja.example/*'],
    ['https://192.168.1.10:3000', 'https://192.168.1.10/*'],
  ])('builds %s into %s', (input, expected) => {
    expect(vikunjaHostPattern(input)).toBe(expected)
  })

  /**
   * The critical case: interpolating one of these would request the maximal
   * grant from the page and make the worker's `permissions.contains` gate
   * pass for every host.
   */
  it.each(WILDCARD_URLS)('refuses to build a pattern from %s', (input) => {
    expect(vikunjaHostPattern(input)).toBeNull()
  })

  it.each(['http://vikunja.example', 'not a url', '', 'ftp://vikunja.example'])(
    'refuses %s',
    (input) => {
      expect(vikunjaHostPattern(input)).toBeNull()
    },
  )

  it('never yields a pattern containing a wildcard in the host', () => {
    for (const input of [...WILDCARD_URLS, 'https://vikunja.example']) {
      const pattern = vikunjaHostPattern(input)
      if (pattern === null) continue
      expect(pattern.slice('https://'.length, -'/*'.length)).not.toContain('*')
    }
  })
})

describe('normalizeVikunjaTimestamp', () => {
  it('drops the sub-second part of a mutation response so it can match a GET', () => {
    // Recon Q16: create/move answer with nanoseconds, the next GET with
    // seconds. Both sides have to land on the same string or every other
    // edit reports a phantom conflict.
    expect(normalizeVikunjaTimestamp('2026-09-20T17:58:54.988820952+03:00')).toBe(
      normalizeVikunjaTimestamp('2026-09-20T17:58:54+03:00'),
    )
  })

  it('answers a UTC ISO string with whole seconds', () => {
    expect(normalizeVikunjaTimestamp('2026-09-20T17:58:54.988820952+03:00')).toBe(
      '2026-09-20T14:58:54.000Z',
    )
  })

  it('is idempotent', () => {
    const once = normalizeVikunjaTimestamp('2026-09-20T17:58:54.988820952+03:00')
    expect(normalizeVikunjaTimestamp(once)).toBe(once)
  })

  it('leaves a string it cannot parse alone rather than inventing the epoch', () => {
    expect(normalizeVikunjaTimestamp('not a date')).toBe('not a date')
  })
})
