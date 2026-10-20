# Contributing to LocalDeck

[🇷🇺 Русская версия](#-как-внести-вклад) | [🇬🇧 English version](#-how-to-contribute)

---

## 🇷🇺 Как внести вклад

LocalDeck — open source под лицензией [MIT](LICENSE). Pull request'ы приветствуются: новые виджеты, интеграции для Todo, фиксы, переводы. Отдельный форк поддерживать не нужно — присылайте PR прямо в этот репозиторий, мейнтейнер ревьюит, вливает и выкатывает в Chrome Web Store.

### Как прислать PR

1. Сделайте форк и ветку. Имя ветки — по политике репозитория: `feature/…`, `fix/…` или `widget/…` (иначе CI не пропустит).
2. Установите зависимости: `yarn install`. Разработка: `yarn dev`, затем загрузите `dist/` как распакованное расширение в `chrome://extensions`.
3. Перед PR прогоните `yarn lint`, `yarn test` и `yarn build`.
4. Откройте PR в `main` и заполните шаблон (RU или EN) — CI проверяет, что все разделы на месте.

### Что держать в голове

- **Local-first.** Без собственных серверов, аналитики и трекинга. Новый сетевой запрос — только если без него фича невозможна, и он должен быть описан в PR.
- **Разрешения.** Новые `permissions` в манифесте — только при реальной необходимости: они меняют окно установки и обновления. Меняете разрешения, сетевые запросы или то, что уходит в `storage.sync`, — обновите [`privacy.html`](privacy.html).
- **Свой виджет или интеграция** — по гайдам в [README](README.md): «Полный гайд: как сделать свой виджет» и «Свой интегратор для Todo-виджета».
- Строки интерфейса — через i18next, на английском и русском.

### Релизы (для мейнтейнера)

1. PR с новой `version` в `package.json` (semver) → merge в `main`.
2. Тег на main: `git tag v1.2.3 && git push origin v1.2.3`.
3. Воркфлоу `Release` проверяет, что тег совпадает с версией, гоняет тесты, собирает `crx-localdeck-<version>.zip` и публикует GitHub Release с патчноутами из названий PR.
4. Zip из релиза загружается в Chrome Web Store.

---

## 🇬🇧 How to contribute

LocalDeck is open source under the [MIT](LICENSE) license. Pull requests are welcome: new widgets, Todo integrations, fixes, translations. There is no need to maintain a separate fork — send PRs straight to this repository; the maintainer reviews, merges and ships them to the Chrome Web Store.

### Sending a PR

1. Fork and create a branch. Branch names follow the repo policy: `feature/…`, `fix/…` or `widget/…` (CI rejects others).
2. Install dependencies: `yarn install`. For development run `yarn dev`, then load `dist/` as an unpacked extension in `chrome://extensions`.
3. Before opening the PR run `yarn lint`, `yarn test` and `yarn build`.
4. Open the PR against `main` and fill in the template (EN or RU) — CI checks that every section is present.

### Things to keep in mind

- **Local-first.** No servers of our own, no analytics, no tracking. Add a network request only when the feature cannot work without it, and describe it in the PR.
- **Permissions.** Add manifest `permissions` only when truly needed: they change the install and update prompt. If you change permissions, network requests or what goes to `storage.sync`, update [`privacy.html`](privacy.html).
- **Your own widget or integration** — follow the guides in the [README](README.md): "Full guide: create your own widget" and "Writing your own Todo integration".
- UI strings go through i18next, in English and Russian.

### Releases (maintainer)

1. PR bumping `version` in `package.json` (semver) → merge to `main`.
2. Tag on main: `git tag v1.2.3 && git push origin v1.2.3`.
3. The `Release` workflow checks the tag matches the version, runs tests, builds `crx-localdeck-<version>.zip` and publishes a GitHub Release with notes generated from PR titles.
4. Upload the zip from the release to the Chrome Web Store.
