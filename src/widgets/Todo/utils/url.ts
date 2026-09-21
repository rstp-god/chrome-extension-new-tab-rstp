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

/**
 * Host (with the port, unlike `hostname`) of a URL string, or `null` when it
 * does not parse — used where the value is shown as an identity rather than
 * as decoration, so a malformed URL has to read as "unknown" instead of as
 * itself.
 */
export function getHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
