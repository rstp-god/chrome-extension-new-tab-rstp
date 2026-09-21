/**
 * Host of a URL string, with the caller's own answer for "that is not a URL".
 *
 * One function rather than two: the widget needs the host in two places with
 * the same parsing and different failure modes — a linked-tab badge would
 * rather show a slightly weird string than nothing, while a sentence naming
 * the instance whose permission was withdrawn has to fall back to different
 * wording instead of to a fragment of a broken URL. So the fallback is an
 * argument, spelled out at every call site.
 *
 * `host`, not `hostname`: a self-hosted instance on a non-default port is a
 * different thing from the same host on 443, and the port is exactly what
 * tells them apart.
 */
export function urlHost<T extends string | null>(url: string, fallback: T): string | T {
  try {
    return new URL(url).host
  } catch {
    return fallback
  }
}
