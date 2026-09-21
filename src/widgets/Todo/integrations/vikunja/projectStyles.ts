/**
 * Vikunja label colour → project pill class.
 *
 * Vikunja stores a free-form `hex_color` rather than a named palette, so the
 * adapter has to decide which of the widget's ten hues a colour is *closest*
 * to. Everything visual lives in `@/widgets/Todo/utils/projectPillPalette.ts`;
 * this file only does the arithmetic.
 */

import {
  DEFAULT_PROJECT_PILL_CLASS,
  projectPillClassForHue,
  type ProjectPillHue,
} from '@/widgets/Todo/utils/projectPillPalette.ts'

/**
 * Representative angle of each coloured hue on the HSL wheel. `black` is
 * absent on purpose — it is the greyscale bucket, picked by saturation
 * rather than by angle.
 */
const HUE_ANGLE: Record<Exclude<ProjectPillHue, 'black'>, number> = {
  red: 0,
  orange: 30,
  yellow: 55,
  lime: 80,
  green: 140,
  sky: 190,
  blue: 215,
  purple: 275,
  pink: 330,
}

/**
 * Below this saturation a colour reads as a grey whatever its angle says —
 * `#888` is not "a dark cyan", it is grey. Matches the `black` entry of the
 * palette, which is Trello's name for its neutral pill.
 */
const GREY_SATURATION = 0.15

/** `#rrggbb`, `rrggbb`, `#rgb` and `rgb` — everything Vikunja's colour picker emits. */
const HEX_RE = /^#?(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i

function parseHex(raw: string): [number, number, number] | null {
  const match = HEX_RE.exec(raw.trim())
  if (!match) return null

  const full = match[2] ?? [...match[1]].map((digit) => digit + digit).join('')
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** Standard RGB → HSL, keeping only what the hue match needs. */
function hueAndSaturation(r: number, g: number, b: number): { hue: number; saturation: number } {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))

  let hue = 0
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  return { hue, saturation }
}

/** Shortest distance between two angles on a 360° wheel. */
function angleDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360
  return raw > 180 ? 360 - raw : raw
}

/**
 * The palette hue closest to a Vikunja `hex_color`, or `null` when the value
 * is missing or not a colour at all.
 *
 * Exported for the tests and for anything that wants the hue rather than the
 * class string.
 */
export function vikunjaHueFor(hex: string | null): ProjectPillHue | null {
  if (!hex) return null
  const rgb = parseHex(hex)
  if (!rgb) return null

  const { hue, saturation } = hueAndSaturation(...rgb)
  if (saturation < GREY_SATURATION) return 'black'

  let best: ProjectPillHue = 'red'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [name, angle] of Object.entries(HUE_ANGLE)) {
    const distance = angleDistance(hue, angle)
    if (distance < bestDistance) {
      bestDistance = distance
      best = name as ProjectPillHue
    }
  }
  return best
}

export function getVikunjaProjectPillClass(hex: string | null): string {
  const hue = vikunjaHueFor(hex)
  return hue === null ? DEFAULT_PROJECT_PILL_CLASS : projectPillClassForHue(hue)
}
