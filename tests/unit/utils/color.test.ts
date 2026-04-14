import { describe, expect, it } from 'vitest'
import {
  computeForeground,
  formatOklch,
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
