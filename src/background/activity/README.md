# Activity tracking module

Background service-worker module that feeds the **Screen Time** widget. Collects per-domain time spent and tab-management metrics, fully local, no cloud sync.

## Module layout

```
src/background/activity/
├── types.ts              # pure type definitions
├── constants.ts          # timing, alarm names, retention limits, storage keys
├── defaults.ts           # default settings (DEFAULT_ACTIVITY_SETTINGS, …)
├── storage.ts            # chrome.storage.local I/O boundary (envelope + Zod + locks)
├── rollup.ts             # pure aggregation logic (no side effects)
├── alarms.ts             # hourly rollup safety net + daily cleanup cap
├── settings.ts           # worker-side settings cache + change watcher
├── tracker.ts            # public API + setupActivityTracking wiring
└── tracker/
    ├── state.ts          # module-level singleton state
    ├── domain.ts         # extractDomain (privacy-critical URL filter)
    ├── dispatch.ts       # event dispatch + hydration + debounced flushes
    ├── session.ts        # active-session lifecycle (start/end/pause/heartbeat)
    ├── idle.ts           # chrome.idle — pauses time accrual when user disengages
    ├── lifecycle.ts      # onSuspend + windows.onRemoved — bounded-loss shutdown
    └── listeners.ts      # chrome.tabs.* / chrome.windows.* event handlers
```

Tests live in `test/` colocated with the module (not under `tests/unit/` — the `vitest.config.ts` `include` is extended for `src/background/**/*.test.ts`).

## Storage layout

All writes go through `storage.ts`. Each key is a Zod-validated envelope:

```ts
{ meta: { originId, rev, ts }, state }
```

The same format `withChromeSync` uses on the UI side, so worker-written records round-trip cleanly.

| Key                 | Purpose                                      | Cadence                                   |
| ------------------- | -------------------------------------------- | ----------------------------------------- |
| `activity_raw`      | Source-of-truth event log                    | Debounced (10s) append; 24h retention     |
| `activity_day`      | Today's snapshot, hourly buckets             | Debounced (5s) after each event           |
| `activity_week`     | Last 7 days, daily buckets                   | On day rollover                           |
| `activity_all`      | Up to 90 days, daily buckets                 | On day rollover; capped by daily alarm    |
| `activity_settings` | Pause, palette, Screen Time prefs (UI-owned) | Written by UI; worker watches for changes |

## Event flow

```
chrome.tabs.on{Activated,Created,Removed,Updated}      pause=false?
chrome.windows.onFocusChanged                                │
        │                                                    ▼
        ▼                                              snapshots
  listeners.ts ──► session.ts ──► dispatch.ts ──► {day,week,all}
                  start/end         ensureRollover
                                    applyEventToDay
                                    scheduleFlush
                                                           │
                                                           ▼
                                                    chrome.storage.local
```

Read-only contract for widgets: pick one of `{day,week,all}` via `useActivity{Day,Week,All}Store` on the UI side — no runtime aggregation, no cold computation.

## Alarm cadence

| Alarm                | Period   | Purpose                                                                          |
| -------------------- | -------- | -------------------------------------------------------------------------------- |
| `activity-heartbeat` | 5 min    | Commits in-flight active session duration so worker kill loses ≤ 5 min of time   |
| `activity-rollup`    | 60 min   | Heartbeat + force day rollover if idle + prune raw                               |
| `activity-cleanup`   | 1440 min | Belt-and-suspenders cap on `activity_all` buckets (rollover already enforces it) |

The heartbeat alarm is the main defense against "browser closed during a long focus session" data loss. Combined with `chrome.runtime.onSuspend` (best-effort final flush) and `chrome.windows.onRemoved` (explicit end-of-session when last window closes), time-loss on shutdown is bounded by the 5-minute window.

## Contracts & guarantees

- **Privacy**: only HTTP(S) hostnames (lowercased, trailing-dot stripped). `chrome://`, `chrome-extension://`, `about:`, `file://`, `data:`, `javascript:` are never recorded. Guaranteed by `tracker/domain.ts::extractDomain` + Zod key denylist.
- **Pause**: global toggle. When `paused`, no session is started, no event dispatched. Pause-transition drops the in-flight session **without** emitting its accumulated duration — the user's "pause" is absolute.
- **Idle detection**: via `chrome.idle` with a 60-second threshold. When user goes idle or screen locks, the in-flight session ends with duration backdated by the threshold (the idle window is not counted). When user returns to `active`, the session is restarted from the focused tab.
- **Async races**: `chrome.tabs.get/query` callbacks are protected by `state.activationSeq` tokens; stale resolutions abort rather than stomp.
- **Clock skew / sleep**: durations clamped to ≤ 24h (`MAX_SESSION_MS`).
- **Concurrency**: per-key single-flight `withLock` around all storage mutations; async read-modify-write cycles (append/prune raw) cannot interleave.
- **Worker respawn**: snapshots hydrate independently; a single corrupt envelope doesn't wipe the other two. Missing snapshots fall back to `rebuildFromRaw` (limited to last 24h of history).
- **Browser shutdown**: heartbeat alarm bounds loss to ≤ 5 min; `onSuspend` + `windows.onRemoved` provide best-effort clean close. The 5-minute ceiling is the hard guarantee — the rest is opportunistic improvement.

## Known limitations

- **Split-screen / dual-monitor focus ambiguity**: if Chrome is visible in a split-screen layout but not the frontmost app, we do not count that time. We cannot distinguish "user looking at Chrome in split-screen" from "Chrome left open in background" — best-effort trade-off.
- **macOS menu-bar lingering**: handled by `chrome.windows.onRemoved` — closing the last window ends the session.

## Permissions

This module uses:

- `tabs` — track tab lifecycle events (already required by Tab Rules Engine).
- `storage` — persist snapshots and settings (already required).
- `alarms` — scheduled heartbeat / rollup / cleanup (already required).
- `idle` — detect user away-from-keyboard for accurate screen-time measurement. **Added specifically for this module.**

## Testing

- `rollup.test.ts` — thorough unit coverage of the pure aggregation logic.
- `tracker.test.ts` — `extractDomain` edge cases + state-machine scenarios with a stubbed `chrome.*` global.
- Full end-to-end scenarios live in `src/widgets/ScreenTime/test/*.scenario.spec.ts`.

## Why split this way

- **Pure vs. stateful separation**: `rollup.ts` is a pure function module; `tracker/*` holds all mutable state. You can reason about aggregation correctness without mocking chrome.
- **Storage as single I/O seam**: `storage.ts` is the only module that touches `chrome.storage.local`. Every concurrency concern (locks, envelopes, validation) lives there.
- **Listener handlers as named functions**: each `chrome.*` event has its own `handleXxx` function. `setupActivityTracking` is six lines of wiring — easy to follow, easy to test the handlers in isolation.

## Related

- UI-side stores: `src/store/activity.ts` (settings) + `src/store/activity.snapshots.ts` (read-only day/week/all) — added in Stage 2.
- Chart color palette: `src/newtab/components/Settings/ChartPaletteSelector.tsx` + `src/utils/color.ts::generateChartPalette` — added in Stage 3.
- Separate Tab Rules Engine tracker: `src/background/cleanup/activityTracker.ts` — unrelated to this module, different storage key, different purpose (idle-tab cleanup).
