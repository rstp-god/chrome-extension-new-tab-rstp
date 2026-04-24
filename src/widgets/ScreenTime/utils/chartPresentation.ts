/**
 * Visual constants shared across the three chart variants. Keeping them here
 * guarantees Bar/Area/Donut stay aligned when we tweak sizing or density.
 */

export const CHART_TICK_FONT_SIZE = 10
export const CHART_Y_AXIS_WIDTH = 32
export const CHART_TICK_MARGIN = 6
export const CHART_GRID_DASH = '3 3'
export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const

export const AREA_FILL_OPACITY_DOMAIN = 0.6
export const AREA_FILL_OPACITY_OTHER = 0.5

export const BAR_RADIUS_NONE: [number, number, number, number] = [0, 0, 0, 0]
export const BAR_RADIUS_TOP: [number, number, number, number] = [4, 4, 0, 0]

/**
 * Donut radii from Activity_Widget_Design.md §2.3 — 62% inner gives enough
 * visual weight to the ring without shrinking it to a sliver; 92% outer
 * keeps a breathing gap to the card edges.
 */
export const DONUT_INNER_RADIUS = '62%'
export const DONUT_OUTER_RADIUS = '92%'
export const DONUT_STROKE_WIDTH = 2

/** Y-axis tick formatter — seconds → minutes with `m` suffix. */
export const minutesTick = (seconds: number): string => `${Math.round(seconds / 60)}m`
