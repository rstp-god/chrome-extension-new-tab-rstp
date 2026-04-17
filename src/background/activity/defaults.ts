import { DEFAULT_CHART_BASE_HEX, DEFAULT_CHART_SHADES } from '@/data/chartPalette.ts'
import type {
  ActivitySettings,
  ChartPalette,
  ScreenTimeSettings,
  TabStatsSettings,
} from '@/background/activity/types.ts'

/**
 * Default values for activity settings. Isolated from `types.ts` so the type
 * module stays pure (types only) and can be safely imported by UI code.
 */

/** Default palette — pulled from `src/data/chartPalette.ts` so UI + worker share one source. */
export const DEFAULT_CHART_PALETTE: ChartPalette = {
  baseHex: DEFAULT_CHART_BASE_HEX,
  shades: DEFAULT_CHART_SHADES,
}

export const DEFAULT_SCREEN_TIME_SETTINGS: ScreenTimeSettings = {
  chartType: 'bar',
  showTopDomains: true,
  showYAxis: true,
  showGrid: false,
  showTooltips: true,
  maxDomains: 5,
  chartPalette: DEFAULT_CHART_PALETTE,
}

export const DEFAULT_TAB_STATS_SETTINGS: TabStatsSettings = {
  visibleMetrics: {
    openNow: true,
    created: true,
    closed: true,
    avgLifetime: true,
    activePct: true,
    peakOpen: false,
  },
  format: 'cards',
  showSparkline: true,
  chartPalette: DEFAULT_CHART_PALETTE,
}

export const DEFAULT_ACTIVITY_SETTINGS: ActivitySettings = {
  paused: false,
  screenTime: DEFAULT_SCREEN_TIME_SETTINGS,
  tabStats: DEFAULT_TAB_STATS_SETTINGS,
}
