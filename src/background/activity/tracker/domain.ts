import { isValidDomainKey } from '@/background/activity/rollup.ts'

/**
 * Privacy-critical URL filter.
 *
 * Returns the normalized hostname for http(s) URLs only. All browser-internal
 * schemes (chrome://, chrome-extension://, about:, file://, data:, etc.) are
 * filtered — we never record them. Normalization: lowercase + trailing-dot stripped.
 *
 * Unit-tested in tracker.test.ts — any change here must keep those tests green.
 */
export function extractDomain(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    let hostname = parsed.hostname
    if (!hostname) return null
    hostname = hostname.toLowerCase()
    if (hostname.endsWith('.')) hostname = hostname.slice(0, -1)
    if (!hostname) return null
    // Prototype-pollution-unsafe keys should never reach aggregation.
    if (!isValidDomainKey(hostname)) return null
    return hostname
  } catch {
    return null
  }
}
