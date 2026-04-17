export type OklchParts = {
  l: number
  c: number
  h: number
  alpha?: number
}

// Preserved digits for stored oklch components. 6 decimals keep hex ↔ oklch
// roundtrips idempotent across the full sRGB gamut — with 4 decimals certain
// high-chroma colours (bright cyans, oranges) drifted by one RGB step per save.
const DECIMAL_PRECISION = 6

const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i

export function parseOklch(value: string): OklchParts | null {
  const m = value.trim().match(OKLCH_RE)
  if (!m) return null
  const [, lStr, cStr, hStr, aStr] = m
  const parts: OklchParts = {
    l: Number(lStr),
    c: Number(cStr),
    h: Number(hStr),
  }
  if (aStr !== undefined) {
    parts.alpha = aStr.endsWith('%') ? Number(aStr.slice(0, -1)) / 100 : Number(aStr)
  }
  return parts
}

export function formatOklch({ l, c, h, alpha }: OklchParts): string {
  const base = `oklch(${round(l)} ${round(c)} ${round(h)}`
  return alpha !== undefined ? `${base} / ${round(alpha)})` : `${base})`
}

/** Inject or replace the alpha component in an oklch() string. */
export function withAlpha(oklchStr: string, alpha: number): string {
  const parts = parseOklch(oklchStr)
  if (!parts) return oklchStr
  return formatOklch({ ...parts, alpha })
}

/**
 * Pick a contrasting foreground for a given oklch color.
 * L >= 0.6 → dark text; L < 0.6 → light text. Matches WCAG AA for normal text.
 */
export function computeForeground(oklchStr: string): string {
  const parts = parseOklch(oklchStr)
  if (!parts) return 'oklch(0.98 0 0)'
  return parts.l >= 0.6 ? 'oklch(0.15 0 0)' : 'oklch(0.98 0 0)'
}

// ============================================================================
// hex ↔ oklch (manual conversion, no deps)
// Reference: https://bottosson.github.io/posts/oklab/
// Pipeline:
//   hex → sRGB (0..1) → linear-sRGB (gamma decode)
//        → Oklab (via the M1·cbrt·M2 matrices below)
//        → Oklch (polar form of ab: C = √(a²+b²), H = atan2(b,a))
// Reverse mirrors the same steps.
// The numeric constants in linearRgbToOklab/oklabToLinearRgb and the sRGB
// gamma transform are the canonical Björn Ottosson matrices — edit only if
// you're replacing the whole algorithm.
// ============================================================================

type RGB = [number, number, number]

function hexToSrgb(hex: string): RGB {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ]
}

function srgbToHex([r, g, b]: RGB): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// Standard sRGB gamma transforms (IEC 61966-2-1).
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  return c >= 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c
}

// Ottosson's M1 matrix (linear sRGB → LMS) followed by cube root,
// then M2 (LMS' → Oklab). See the reference link at the top of this section.
function linearRgbToOklab([r, g, b]: RGB): RGB {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

// Inverse: Oklab → LMS' via M2⁻¹, cube, then LMS → linear sRGB via M1⁻¹.
function oklabToLinearRgb([L, a, b]: RGB): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function oklabToOklch([L, a, b]: RGB): RGB {
  const C = Math.sqrt(a * a + b * b)
  let H = (Math.atan2(b, a) * 180) / Math.PI
  if (H < 0) H += 360
  return [L, C, H]
}

function oklchToOklab([L, C, H]: RGB): RGB {
  const h = (H * Math.PI) / 180
  return [L, C * Math.cos(h), C * Math.sin(h)]
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Convert a hex color string (#rrggbb or #rgb) to an oklch() CSS string. */
export function hexToOklch(hex: string): string {
  const [r, g, b] = hexToSrgb(hex)
  const lin: RGB = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
  const lab = linearRgbToOklab(lin)
  const [L, C, H] = oklabToOklch(lab)
  return formatOklch({ l: L, c: C, h: H })
}

/** Convert an oklch() CSS string to a hex color string (#rrggbb). */
export function oklchToHex(oklchStr: string): string {
  const parts = parseOklch(oklchStr)
  if (!parts) return '#000000'
  const lab = oklchToOklab([parts.l, parts.c, parts.h])
  const [lr, lg, lb] = oklabToLinearRgb(lab)
  const rgb: RGB = [clamp01(linearToSrgb(lr)), clamp01(linearToSrgb(lg)), clamp01(linearToSrgb(lb))]
  return srgbToHex(rgb)
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(DECIMAL_PRECISION)))
}

/** Chart palette: base hue fixed, lightness varied per entry. Invalid input → grey ramp. */
export function generateChartPalette(
  baseHex: string,
  lightnesses: readonly number[],
): string[] {
  const { c, h } = parseOklch(hexToOklch(baseHex)) ?? { c: 0, h: 0 }
  return lightnesses.map((l) => formatOklch({ l, c, h }))
}
