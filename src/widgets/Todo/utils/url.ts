/**
 * Extracts the hostname from a URL string with a graceful fallback to the
 * raw input — used by linked-tab badges where we'd rather show a slightly
 * weird value than crash on a malformed URL.
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
