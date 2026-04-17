import { describe, expect, it } from 'vitest'

import { CHART_SHADE_LIGHTNESSES } from '@/data/chartPalette.ts'
import {
  computeForeground,
  formatOklch,
  generateChartPalette,
  hexToOklch,
  oklchToHex,
  parseOklch,
  withAlpha,
} from '@/utils/color.ts'

describe('parseOklch', () => {
  it('parses simple oklch strings', () => {
    expect(parseOklch('oklch(0.5 0.1 230)')).toEqual({ l: 0.5, c: 0.1, h: 230 })
  })

  it('parses alpha (decimal)', () => {
    expect(parseOklch('oklch(0.5 0.1 230 / 0.6)')).toEqual({ l: 0.5, c: 0.1, h: 230, alpha: 0.6 })
  })

  it('parses alpha (percent)', () => {
    expect(parseOklch('oklch(0.5 0.1 230 / 50%)')).toEqual({ l: 0.5, c: 0.1, h: 230, alpha: 0.5 })
  })

  it('returns null for invalid', () => {
    expect(parseOklch('rgb(0 0 0)')).toBeNull()
    expect(parseOklch('garbage')).toBeNull()
  })
})

describe('formatOklch', () => {
  it('formats without alpha', () => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 230 })).toBe('oklch(0.5 0.1 230)')
  })
  it('formats with alpha', () => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 230, alpha: 0.5 })).toBe('oklch(0.5 0.1 230 / 0.5)')
  })
})

describe('withAlpha', () => {
  it('adds alpha when absent', () => {
    expect(withAlpha('oklch(0.5 0.1 230)', 0.5)).toBe('oklch(0.5 0.1 230 / 0.5)')
  })
  it('replaces existing alpha', () => {
    expect(withAlpha('oklch(0.5 0.1 230 / 0.3)', 0.8)).toBe('oklch(0.5 0.1 230 / 0.8)')
  })
  it('leaves invalid input alone', () => {
    expect(withAlpha('garbage', 0.5)).toBe('garbage')
  })
})

describe('computeForeground', () => {
  it('returns dark foreground for light color (L >= 0.6)', () => {
    expect(computeForeground('oklch(0.8 0.05 200)')).toBe('oklch(0.15 0 0)')
  })
  it('returns light foreground for dark color (L < 0.6)', () => {
    expect(computeForeground('oklch(0.4 0.05 200)')).toBe('oklch(0.98 0 0)')
  })
  it('falls back for invalid input', () => {
    expect(computeForeground('garbage')).toBe('oklch(0.98 0 0)')
  })
})

describe('hex ↔ oklch roundtrip', () => {
  it('converts white', () => {
    const oklch = hexToOklch('#ffffff')
    expect(parseOklch(oklch)?.l).toBeCloseTo(1, 2)
    expect(oklchToHex(oklch).toLowerCase()).toBe('#ffffff')
  })

  it('converts black', () => {
    const oklch = hexToOklch('#000000')
    expect(parseOklch(oklch)?.l).toBeCloseTo(0, 2)
    expect(oklchToHex(oklch).toLowerCase()).toBe('#000000')
  })

  it('preserves a mid-range color within tolerance', () => {
    const input = '#3366cc'
    const back = oklchToHex(hexToOklch(input)).toLowerCase()
    expect(back).toBe(input)
  })
})

describe('generateChartPalette', () => {
  it('returns 5 OKLCH strings with the given lightness values', () => {
    const shades = generateChartPalette('#38A0D6', CHART_SHADE_LIGHTNESSES)
    expect(shades).toHaveLength(5)
    shades.forEach((shade, i) => {
      const parts = parseOklch(shade)
      expect(parts).not.toBeNull()
      expect(parts!.l).toBeCloseTo(CHART_SHADE_LIGHTNESSES[i], 3)
    })
  })

  it('holds chroma and hue constant across all shades', () => {
    const shades = generateChartPalette('#4CAF50', CHART_SHADE_LIGHTNESSES)
    const parts = shades.map((s) => parseOklch(s)!)
    const c = parts[0].c
    const h = parts[0].h
    parts.forEach((p) => {
      expect(p.c).toBeCloseTo(c, 6)
      expect(p.h).toBeCloseTo(h, 6)
    })
  })

  it('derives different hues for different base colors', () => {
    const blue = generateChartPalette('#38A0D6', CHART_SHADE_LIGHTNESSES)
    const orange = generateChartPalette('#F59E0B', CHART_SHADE_LIGHTNESSES)
    const blueHue = parseOklch(blue[0])!.h
    const orangeHue = parseOklch(orange[0])!.h
    expect(Math.abs(blueHue - orangeHue)).toBeGreaterThan(30)
  })

  it('falls back to achromatic ramp for unparseable input (no throw)', () => {
    const shades = generateChartPalette('not-a-hex', CHART_SHADE_LIGHTNESSES)
    expect(shades).toHaveLength(CHART_SHADE_LIGHTNESSES.length)
    for (const shade of shades) {
      const parts = parseOklch(shade)
      expect(parts).not.toBeNull()
      expect(parts!.c).toBe(0)
      expect(parts!.h).toBe(0)
    }
  })

  it('matches output length to input length (length-agnostic)', () => {
    expect(generateChartPalette('#38A0D6', [0.5])).toHaveLength(1)
    expect(generateChartPalette('#38A0D6', [0.3, 0.5, 0.7])).toHaveLength(3)
    expect(generateChartPalette('#38A0D6', [0.2, 0.4, 0.6, 0.8])).toHaveLength(4)
  })

  // Achromatic inputs (C≈0): hue atan2(0,0) = 0, so all shades collapse to
  // the "red" axis. Document the current behaviour so nobody changes it
  // accidentally — if we decide to fall back to a default hue, this test flips.
  it('handles mid-grey (#808080) producing near-zero chroma', () => {
    const shades = generateChartPalette('#808080', CHART_SHADE_LIGHTNESSES)
    expect(shades).toHaveLength(5)
    for (const shade of shades) {
      const parts = parseOklch(shade)
      expect(parts).not.toBeNull()
      expect(parts!.c).toBeLessThan(0.01)
    }
  })

  it('handles pure white (#ffffff)', () => {
    const shades = generateChartPalette('#ffffff', CHART_SHADE_LIGHTNESSES)
    expect(shades).toHaveLength(5)
    // Lightness values still follow the ramp regardless of source L.
    shades.forEach((shade, i) => {
      expect(parseOklch(shade)!.l).toBeCloseTo(CHART_SHADE_LIGHTNESSES[i], 3)
    })
  })

  it('handles pure black (#000000)', () => {
    const shades = generateChartPalette('#000000', CHART_SHADE_LIGHTNESSES)
    expect(shades).toHaveLength(5)
    shades.forEach((shade, i) => {
      expect(parseOklch(shade)!.l).toBeCloseTo(CHART_SHADE_LIGHTNESSES[i], 3)
    })
  })
})
