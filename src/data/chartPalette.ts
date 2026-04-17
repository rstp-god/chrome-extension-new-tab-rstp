/**
 * Default chart palette — single source of truth.
 *
 * Used by:
 *   - `src/background/activity/defaults.ts` — seeds the settings store.
 *   - `src/newtab/hooks/useApplyAppearance.ts` — runtime CSS-variable injection
 *     (wired up in Stage 3).
 *
 * `src/styles/styles.css` holds duplicate fallback values for the same
 * `--chart-1`..`--chart-5` vars — those are the bootstrap values rendered
 * before React mounts (and a safety net if runtime injection fails). Keep
 * the two lists in sync; TS cannot import CSS variable values at compile time.
 */

/** Base HEX used to seed the store. Users can change it from the palette picker. */
export const DEFAULT_CHART_BASE_HEX = '#38A0D6'

/**
 * Five OKLCH shades derived from the base (lightness scaled 0.865 → 0.45,
 * fixed chroma + hue). Listed chart-1 → chart-5, lightest to darkest.
 */
export const DEFAULT_CHART_SHADES: readonly [string, string, string, string, string] = [
  'oklch(0.865 0.127 207.078)',
  'oklch(0.715 0.143 215.221)',
  'oklch(0.609 0.126 221.723)',
  'oklch(0.52 0.105 223.128)',
  'oklch(0.45 0.085 224.283)',
]
