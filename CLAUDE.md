# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Chrome extension (Manifest V3) that replaces the new tab page with a customizable widget grid. Built with React 19 + TypeScript + Vite via `@crxjs/vite-plugin`. State managed by Zustand, persisted through `chrome.storage` (each store picks its area — see **Chrome sync**). UI uses Tailwind v4 + shadcn/Radix. i18n via i18next (English and Russian, English default).

The extension also ships a popup (the Tab Rules Engine) and an MV3 background service worker. There is no content script and no side panel — `manifest.config.ts` declares neither. A separate "showcase" build (`vite.showcase.config.ts`, `VITE_RUNTIME_MODE=showcase`) renders the new-tab UI as a normal web page using demo data instead of Chrome APIs — this is what GitHub Pages publishes.

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

- **`yarn lint` currently checks almost nothing of ours.** The `files` glob in `eslint.config.js` is written as `'/src/**/*.{js,mjs,cjs,ts,tsx}'` — with a leading `/` it is an absolute path and never matches a repo file, so the project's own rules (`import/order`, `@typescript-eslint/consistent-type-imports`, `no-console`, `eqeqeq`, …) are **not applied**. Only the flat recommended presets run. Until that glob is fixed in a separate change, verify those conventions by hand in review.

Husky `pre-commit` runs `yarn lint` and `yarn format`.

## Architecture

### Layout

- `manifest.config.ts` — MV3 manifest (permissions: `storage`, `tabs`, `bookmarks`, `tabGroups`, `alarms`, `notifications`, `idle`)
- `src/newtab/` — new tab page entry (`index.html`, `App.tsx`, `main.tsx`, components for Header / Background / WidgetLayout)
- `src/popup/` — Tab Rules Engine popup (rule management, sorting, cleanup settings)
- `src/background/` — background service worker (rule execution, cleanup scheduler, activity tracking, Vikunja bridge + background pull)
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

- **Storage area is per store.** `withChromeSync` takes an `area` option that is either a fixed area or a resolver over the live state: `area?: 'local' | 'sync' | ((state) => 'local' | 'sync')`, defaulting to `'local'`. Current assignment:
  - `'sync'` — `src/store/header.ts`, `src/store/widget.ts`, `src/store/appearance.ts`, `src/widgets/ChromeLibrary/store/store.ts`, `src/widgets/Productivity/store/useProductivityStore.ts`;
  - `'local'` (the default, left implicit) — `src/popup/store/tabRules.ts`, `src/store/activity.ts` and the activity snapshots;
  - **dynamic** — the Todo store: `area: (state) => (state.integration ? 'local' : 'sync')` (`src/widgets/Todo/store/store.ts`). With no integration the task list roams via `chrome.storage.sync`; connecting one moves the whole envelope to `chrome.storage.local`, so an instance URL and an API token never leave the device. `zustandChromeSync.ts` owns the load-time ambiguity (it probes `local` first for a dynamic-area store) and the transition between areas.
- Integration credentials therefore live in `chrome.storage.local` only, never in `sync`.
- The widget store uses `autoPersist: false`; writes happen via explicit `commit()`.
- Outside the extension context (e.g. showcase, tests) `chrome.*` may be `undefined` — always guard.

### Vikunja bridge (`src/background/vikunja/`)

Vikunja's API sends no `Access-Control-Allow-Origin` for `chrome-extension://` origins, so the New Tab page cannot `fetch` it. Every Vikunja call therefore hops through the service worker, whose background fetches (made under a host permission) are not subject to CORS.

- `messages.ts` — the shared vocabulary: op names, wire types, error keys, `normalizeVikunjaBaseUrl` / `vikunjaHostPattern`, broadcast shapes, pull periods. **Boundary rule:** this is the _only_ module allowed to cross between `src/background/vikunja/**` and `src/widgets/**`. Nothing under `src/background/vikunja/` may import `src/widgets/`, and `src/widgets/Todo/integrations/vikunja/` may import from `src/background/` through this file alone. Enforced by `tests/contracts/vikunjaBoundary.test.ts`.
- `gate.ts` — `withVikunjaClient`: re-validates the config with Zod, derives the host match pattern and confirms the grant with `chrome.permissions.contains` **before every operation** (never `permissions.request` — that needs a page gesture), then hands `run` a ready client. Both the bridge ops and the background pull go through it, so neither can skip a check.
- `client.ts` — **the only `fetch` to a Vikunja instance in the codebase.** Token travels in the `Authorization` header only; `redirect: 'error'`, `credentials: 'omit'`, `cache: 'no-store'`. `POST /tasks/:id` is a full replace, so writes are read-modify-write.
- `handlers.ts` — op dispatch; `pull.ts` / `alarm.ts` / `cache.ts` — background pull on the `vikunja-pull` alarm (period 1/5/15 min from the widget's config, default 5), snapshots in `chrome.storage.local` under `vikunja:snapshot:<projectId>:<viewId>`, `vikunja/pulled` / `vikunja/pull-failed` broadcasts via `broadcast.ts`. The worker keeps nothing between wake-ups: it re-reads `todo-widget:v1` out of `chrome.storage.local` with a minimal schema of its own on every alarm.
- **Listeners register synchronously at worker top level** (`setupVikunjaBridge`, `setupVikunjaPull` from `src/background/index.ts`). The event that woke a cold worker is dispatched right after the script evaluates, so a listener attached behind an `await` misses it.
- **No hidden metadata for Vikunja** — its web editor (TipTap) strips HTML comments, so the Trello-style blob in the description is unusable. The local id is derived (`vikunja:<task.id>`) and `createdAt` / status timestamps come from native fields.

`src/widgets/Todo/integrations/vikunja/` is the page half: `bridge.ts` (message send + Zod validation, no `fetch`), the connect form (requests `https://<host>/*` via `chrome.permissions.request` synchronously inside the submit click), the mapping wizard, flat mode, `subscribe.ts` (listens for the broadcast), `permission.ts` (`recoverPermission`).

Verified API behaviour — response shapes, the traps, the CORS result, the web-editor finding — is written down in **`docs/vikunja-recon.md`**; check it before changing anything about the Vikunja transport or schemas.

## Conventions

- **TypeScript everywhere.** The intended rules are `@typescript-eslint/consistent-type-imports` (separate `import type`), unused-vars (allow `_`-prefixed), `eqeqeq`, `no-var`, `prefer-const`, `no-console` (only `warn`/`error` allowed), and an `import/order` rule with alphabetized groups separated by blank lines. `yarn lint:fix` autofixes ordering — **but see the `eslint.config.js` glob caveat under Commands → Tests: these rules are not actually being applied right now**, so follow them by hand and match the surrounding files.
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
