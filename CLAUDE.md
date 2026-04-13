# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Chrome extension (Manifest V3) that replaces the new tab page with a customizable widget grid. Built with React 19 + TypeScript + Vite via `@crxjs/vite-plugin`. State managed by Zustand, persisted through `chrome.storage.local`. UI uses Tailwind v4 + shadcn/Radix. i18n via i18next (English and Russian, English default).

The extension also ships a popup, side panel, and a content script for `https://*/*`. A separate "showcase" build (`vite.showcase.config.ts`, `VITE_RUNTIME_MODE=showcase`) renders the new-tab UI as a normal web page using demo data instead of Chrome APIs — this is what GitHub Pages publishes.

Package manager: **yarn**.

## Commands

Build / dev:

- `yarn dev` — Vite dev build of the extension (load `dist/` as unpacked in `chrome://extensions/`)
- `yarn build` — production build (`tsc -b && vite build`); also produces `release/crx-*.zip`
- `yarn dev:showcase` / `yarn build:showcase` / `yarn preview:showcase` — showcase web build
- `yarn lint` / `yarn lint:fix` — ESLint
- `yarn format` / `yarn format:check` — Prettier

Tests (see `README.md` for the full matrix):

- `yarn test` — Vitest unit/component (jsdom not default; environment is `node`, individual files opt in)
- `yarn test:coverage` — Vitest with coverage thresholds (70/70/60/70)
- `yarn test:smoke:local` — Playwright smoke (`tests/smoke/`), `chromium-mac` project
- `yarn test:extension:local` — Playwright extension + widget scenarios, `chromium-mac` project
- `yarn test:extension:update-snapshots` — refresh local mac baselines
- `*:ci` variants run under `xvfb-run` against the `chromium-ci` project (Linux baselines)
- **Run `yarn build` once before any Playwright command** — the extension tests load `dist/`
- Visual baselines are stored per environment under `chromium-mac/` and `chromium-ci/` next to each spec; both are committed. Never overwrite `chromium-ci` baselines from a Mac — use the `Update Visual Snapshots` GitHub workflow or the `*:ci` scripts.

Husky `pre-commit` runs `yarn lint` and `yarn format`.

## Architecture

### Layout

- `manifest.config.ts` — MV3 manifest (permissions: `contentSettings`, `storage`, `tabs`, `bookmarks`, `tabGroups`, `alarms`, `notifications`)
- `src/newtab/` — new tab page entry (`index.html`, `App.tsx`, `main.tsx`, components for Header / Background / WidgetLayout)
- `src/popup/` — Tab Rules Engine popup (rule management, sorting, cleanup settings)
- `src/background/` — background service worker (rule execution, cleanup scheduler)
- `src/content/` — content script for `https://*/*`
- `src/showcase/` — showcase-mode entry
- `src/widgets/<Name>/` — one folder per widget (currently `Search`, `Todo`, `ChromeLibrary`)
- `src/store/` — global Zustand stores (`header.ts`, `widget.ts`)
- `src/services/chrome/` — `chrome.storage` wrapper + `withChromeSync` Zustand middleware
- `src/services/zod/` — envelope schemas for persisted state
- `src/types/widgets.ts` — `WidgetMeta`, `WidgetModule`, and the auto-built `widgetRegistry`
- `src/i18n/` — i18next setup; resources under `src/i18n/resources/<lang>/widgets/<widget>.json`
- `src/components/ui/` — shadcn-generated primitives; `components.json` configures shadcn
- `tests/` — shared Vitest + Playwright infrastructure (`setup.ts`, `fixtures/`, `helpers/`, `mocks/`, `constants/`, `unit/`, `stores/`, `contracts/`, `smoke/`, `extension/`)

Path aliases: `@/*` → `src/*`, `@tests/*` → `tests/*` (configured in `vite.config.ts`, `vitest.config.ts`, and the tsconfigs).

### Widget registry

`src/types/widgets.ts` builds `widgetRegistry` at import time from:

```ts
import.meta.glob('../widgets/*/index.ts', { eager: true })
```

Each `src/widgets/<Name>/index.ts` must export `meta: WidgetMeta` and `Component`, and may export `PreviewComponent`. The `meta.widgetType` string keys the registry and is the source of truth used by `AddWidgetDialog`, `createWidgetInstance`, `renderWidget`, and the Zod enum that validates the widget store. **`widgetType` must be unique** across widgets — collisions silently overwrite. Widget tests live in `src/widgets/<Name>/test/`; Playwright scenario specs are `*.scenario.spec.ts` and run alongside `tests/extension`.

### Chrome sync

Zustand stores wrap with `withChromeSync`. Stores declare `partialize` (which fields to persist); on `commit()` (or automatically when `autoPersist: true`) the slice is wrapped in an envelope (`meta.originId`, `meta.rev`, `meta.ts`, `state`) and written to `chrome.storage.local`. `chrome.storage.onChanged` propagates external updates; conflicts are resolved by `originId` + `rev`. Incoming envelopes are validated by Zod schemas (`makeEnvelopeSchema`) — invalid storage entries are dropped rather than crashing.

Notes:

- Storage area is **`chrome.storage.local`**, not `sync`.
- The widget store uses `autoPersist: false`; writes happen via explicit `commit()`.
- Outside the extension context (e.g. showcase, tests) `chrome.*` may be `undefined` — always guard.

## Conventions

- **TypeScript everywhere.** ESLint enforces `@typescript-eslint/consistent-type-imports` (separate `import type`), unused-vars (allow `_`-prefixed), `eqeqeq`, `no-var`, `prefer-const`, `no-console` (only `warn`/`error` allowed), and an `import/order` rule with alphabetized groups separated by blank lines. Run `yarn lint:fix` to autofix ordering.
- Prettier config: see `.prettierrc.json`.
- Keep widgets self-contained: components, store, types, services, tests inside `src/widgets/<Name>/`. Only promote to `src/store/` or `src/services/` when shared across widgets.
- Localize widget strings via i18next namespaces under `src/i18n/resources/<lang>/widgets/`. Default language is English.
- Don't add new Chrome `permissions` without need — they affect the install/update prompt. Update `manifest.config.ts` and the README permissions list together.
- For `react-grid-layout`, the direct child of the grid must be a DOM element whose key matches `layout.i`. Wrap custom widget components accordingly or drag/resize will misbehave.
- Don't store large binary blobs in `chrome.storage.local`; validate any external/API data with Zod before persisting.

## CI

GitHub Actions in `.github/workflows/`:

- `build.yml` — build check
- `tests.yml` — Vitest + Playwright (smoke + extension) on Linux
- `update-visual-snapshots.yml` — manual workflow to refresh `chromium-ci` baselines; download the `playwright-snapshots-ci` artifact, unpack at repo root, commit
- `showcase-pages.yml` — publishes the showcase build to GitHub Pages
- `branch-naming-policy.yml`, `validate-pr-body.yml`, `validate-issue-template.yml` — repo hygiene; PR/issue templates are bilingual (`.github/PULL_REQUEST_TEMPLATE/`, `.github/ISSUE_TEMPLATE/`)
