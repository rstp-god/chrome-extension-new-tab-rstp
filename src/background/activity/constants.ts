/**
 * Timing, alarm, and storage-key constants for the activity feature.
 * Keep this file flat — no logic, no imports beyond types.
 */

// --- Time units (milliseconds) ---

export const ONE_SECOND_MS = 1000
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
export const ONE_DAY_MS = 24 * ONE_HOUR_MS

// --- chrome.storage.local keys ---

export const ACTIVITY_KEYS = {
  raw: 'activity_raw',
  day: 'activity_day',
  week: 'activity_week',
  all: 'activity_all',
  settings: 'activity_settings',
} as const

export type ActivityStorageKey = (typeof ACTIVITY_KEYS)[keyof typeof ACTIVITY_KEYS]

// --- Retention limits ---

export const ACTIVITY_LIMITS = {
  /** `activity_raw` is truncated to events newer than this many hours. */
  rawMaxAgeHours: 24,
  /** `activity_raw` retention in ms (derived from hours above). */
  rawMaxAgeMs: 24 * ONE_HOUR_MS,
  /** `activity_week.buckets.length` is capped at this value. */
  weekMaxBuckets: 7,
  /** `activity_all.buckets.length` is capped at this value. */
  allMaxBuckets: 90,
} as const

// --- Tracker timings ---

/** Debounce window before snapshot writes land in chrome.storage.local. */
export const SNAPSHOT_FLUSH_DELAY_MS = 5 * ONE_SECOND_MS
/** Debounce window for the raw event buffer. */
export const RAW_FLUSH_DELAY_MS = 10 * ONE_SECOND_MS
/**
 * Sessions longer than one day are assumed to be clock-skew / OS-sleep artifacts
 * and clamped to this value — otherwise a single misbehaving event could pollute
 * a whole month of aggregates.
 */
export const MAX_SESSION_DURATION_MS = ONE_DAY_MS

// --- Idle detection ---

/**
 * After this many seconds without keyboard/mouse input, `chrome.idle` reports
 * the user as idle. 60s is the pragmatic sweet spot — short enough to reject
 * "tab left open while making coffee", long enough to survive brief pauses
 * while reading.
 */
export const IDLE_DETECTION_INTERVAL_SEC = 60
export const IDLE_DETECTION_INTERVAL_MS = IDLE_DETECTION_INTERVAL_SEC * ONE_SECOND_MS

// --- Alarms ---

export const ACTIVITY_HEARTBEAT_ALARM = 'activity-heartbeat'
export const ACTIVITY_ROLLUP_ALARM = 'activity-rollup'
export const ACTIVITY_CLEANUP_ALARM = 'activity-cleanup'

/**
 * Heartbeat flushes the in-flight active session every 5 minutes so that
 * data loss is bounded by this window when the worker is killed (browser
 * close, OS termination, etc).
 */
export const HEARTBEAT_PERIOD_MIN = 5
export const ROLLUP_PERIOD_MIN = 60
export const CLEANUP_PERIOD_MIN = 60 * 24
