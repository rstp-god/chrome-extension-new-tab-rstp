/**
 * Convert a hostname into a CSS-ident-safe slug for use as a custom property key
 * (`--color-<slug>`) and `dataKey` on recharts.
 *
 * CSS custom property names allow letters, digits, underscore, and hyphen.
 * Dots (`github.com`) and any non-ASCII characters are replaced with `_`.
 * Prefix `d_` guarantees the slug starts with a letter even for digit-leading hosts.
 *
 * Example: `github.com` → `d_github_com`, `xn--bcher-kva.example` → `d_xn__bcher_kva_example`.
 */
export function slugifyDomain(domain: string): string {
  return 'd_' + domain.toLowerCase().replace(/[^a-z0-9]/g, '_')
}
