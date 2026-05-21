# Productivity widget

Displays four large daily task counters (closed, full-flow, planned, WIP) and a
single KPI traffic-light that answers "was today productive?" relative to a
rolling 14-day baseline. It replaced the old "Tab Stats" widget.

## The 4 metrics

All four are derived by `lib/aggregateDaily.ts` by iterating the full Todo task
list once per target day window (local midnight to local midnight).

| Metric     | Definition                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `closed`   | Tasks whose `completedAt` falls inside the local day                                                                                                                       |
| `planned`  | Tasks whose `createdAt` falls inside the local day                                                                                                                         |
| `fullFlow` | Tasks created AND completed on the same day                                                                                                                                |
| `wip`      | Tasks that existed before end-of-day and were not in a terminal state (`completed`/`deleted`) by end-of-day; uses current `status` + `statusChangedAt` as an approximation |

`closed` is always visible; `fullFlow`, `planned`, and `wip` are individually
toggleable in settings.

## Baseline

`lib/baseline.ts` computes a 14-day rolling baseline over the calendar days
strictly before today (today's in-progress numbers never feed their own
baseline). Days are split into weekday (Mon–Fri, `weekday` 0–4) and weekend
(Sat–Sun, `weekday` 5–6) buckets. For each bucket a **median** (not mean) is
used — this makes the baseline robust to outlier days.

Medians are suppressed to `null` when fewer than 3 days are present in a bucket
(cold-start gate in `computeBaseline`).

### Cold-start gate

`ProductivityWidget.tsx` derives `coldStart` from the baseline as follows:

- **`splitWeekdayWeekend` ON** (default): `coldStart` is `true` when
  `daysOfHistory < 7`, OR when on a weekend day `weekendDays < 3`, OR when on a
  weekday `weekdayDays < 3`.
- **`splitWeekdayWeekend` OFF**: `coldStart` is `true` when `daysOfHistory < 7`
  OR `weekdayDays < 3` (weekend days are never checked; only the weekday median
  is used as the comparison baseline).

When `coldStart` is `true` the KPI shows grey/cold and no delta arrows are
rendered.

## KPI traffic-light

Implemented in `components/KpiLight.tsx::computeKpi`.

1. If `coldStart` is `true` → **cold** (grey).
2. Pick the baseline median: `computeKpi` receives `splitWeekdayWeekend` and mirrors the same logic used by the metric cards. When `splitWeekdayWeekend` is **ON**, weekend medians are used on Sat/Sun and weekday medians otherwise. When `splitWeekdayWeekend` is **OFF**, the weekday median is always used — even on a weekend day. This keeps the KPI traffic-light and the per-metric delta arrows in agreement. If either `closedBaseline` or `wipBaseline` is `null` → **cold**.
3. `goodClosed` = `today.closed >= closedBaseline`
4. `goodWip` = `today.wip <= wipBaseline + 1`
5. Both good → **green**; neither good → **red**; one good → **yellow**.

## Data source

The widget reads task timestamps directly from `useTodoStore` (the Todo widget's
Zustand store). There is no separate event log. On every `tasks` change the
store subscribes, debounces (500 ms), and throttles (30 s) a `refresh()` call
that:

1. Calls `aggregateDaily` on the current task list for today.
2. Writes the snapshot to `chrome.storage.local` under the key
   `productivity_daily` via `lib/dailyCache.ts`.
3. Reads the full cache and calls `computeBaseline` to produce `BaselineStats`.

The cache retains up to 45 entries (by ISO date, oldest entries pruned first).
A full rebuild (`rebuildDailyCache`) recomputes the most recent 30 days from the
live task list.

## Privacy

100% local. Only aggregate counts (`closed`, `planned`, `fullFlow`, `wip`) are
computed and persisted. Task titles, descriptions, and other content are never
read or stored by this widget. Nothing leaves `chrome.storage.local`.

## File map

```
src/widgets/Productivity/
├── index.ts                          # widget registry entry (meta + Component)
├── types.ts                          # ProductivityDaily, BaselineStats, MetricBaseline
├── ProductivityWidget.tsx            # main component; coldStart derivation
├── ProductivityWidgetPreview.tsx     # add-widget preview thumbnail
├── preview.fixture.ts                # fixture data for the preview
├── components/
│   ├── KpiLight.tsx                  # traffic-light dot + computeKpi
│   ├── ProductivityNumber.tsx        # single metric card with delta arrow
│   └── ProductivitySettings.tsx     # settings dialog
├── lib/
│   ├── aggregateDaily.ts             # pure: todo tasks → ProductivityDaily
│   ├── baseline.ts                   # pure: cache → BaselineStats (median)
│   └── dailyCache.ts                 # chrome.storage.local I/O boundary
├── store/
│   └── useProductivityStore.ts       # Zustand store; drives refresh pipeline
├── showcase/
│   └── mocks.ts                      # showcase-mode fixtures
└── test/                             # Vitest unit tests + Playwright scenario
```
