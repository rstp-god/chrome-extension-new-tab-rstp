# RSTP New Tab Chrome Extension 🚀

📚 **Выберите язык / Choose your language:**  
[🇷🇺 Русская версия](#-русская-версия) | [🇬🇧 English version](#-english-version)

## 🇷🇺 Русская версия

Расширение заменяет стандартную вкладку Chrome на кастомную страницу с настраиваемыми виджетами, фоном и настройками интерфейса.

### Оглавление

- [🌐 i18n](#-i18n-новое)
- [🛠️ Технологии проекта](#️-технологии-проекта)
- [⚡ Быстрый старт](#-быстрый-старт)
- [🧩 Архитектура](#-архитектура-для-стороннего-разработчика)
- [🔄 Как работает синхронизация с Chrome](#-как-работает-синхронизация-с-chrome)
- [🧪 Полный гайд: как сделать свой виджет](#-полный-гайд-как-сделать-свой-виджет)
- [🔐 Разрешения Chrome](#-разрешения-chrome-что-обязательно-учитывать)
- [💡 Практические рекомендации](#-практические-рекомендации-для-сторонних-разработчиков)
- [✅ Чеклист](#-чеклист-при-добавлении-нового-виджета)
- [🧰 Полезные команды](#-полезные-команды)

### 🌐 i18n (новое)

- Добавлена базовая i18n-инфраструктура в `src/i18n/`.
- Переводы виджетов лежат в подпапках вида `src/i18n/resources/<lang>/widgets/<widget>.json`.
- Поддерживаются 2 языка: `English` и `Русский`.
- Язык по умолчанию — `English`.
- Выбор языка хранится в `header`-store (`language`) и меняется через `SettingsDialog`.
- Для примера локализации используется `newtab/search widget`.
- Добавлены отдельные переводы для ошибок страницы и ошибок виджетов.

## 🛠️ Технологии проекта

- React + TypeScript
- Vite + CRXJS (`@crxjs/vite-plugin`) для сборки расширения
- Zustand для состояния
- `chrome.storage.local` для синхронизации данных между контекстами расширения

## ⚡ Быстрый старт

1. Установите зависимости:

```bash
yarn install
```

2. Запустите сборку в режиме разработки:

```bash
yarn dev
```

3. В Chrome откройте `chrome://extensions/`.
4. Включите **Developer mode**.
5. Нажмите **Load unpacked** и выберите папку `dist`.

Сборка production:

```bash
yarn build
```

## 🧩 Архитектура (для стороннего разработчика)

### Где что находится

- `manifest.config.ts` — манифест расширения и разрешения Chrome.
- `src/newtab/` — UI новой вкладки.
- `src/i18n/` — словари переводов и функция получения строки по ключу.
- `src/store/` — Zustand-сторы приложения.
- `src/services/chrome/` — работа с `chrome.storage` и синхронизация.
- `src/types/widgets.ts` — типы виджетов и `widgetRegistry`.
- `src/widgets/*` — сами виджеты (по папке на виджет).

### Как работает `widget registry`

Реестр виджетов строится автоматически через:

```ts
import.meta.glob('../widgets/*/index.ts', { eager: true })
```

Каждый `index.ts` в `src/widgets/<WidgetName>/` должен экспортировать:

- `meta` (`WidgetMeta`) — метаинформация виджета
- `Component` — React-компонент виджета

На основе `meta.widgetType` формируется словарь `widgetRegistry`, который используется:

- в диалоге добавления виджета (`AddWidgetDialog`)
- в фабрике инстансов (`createWidgetInstance`)
- в рендеринге (`renderWidget`)
- в валидации стора (enum по ключам registry)

Итог: если вы корректно добавили новый `src/widgets/MyWidget/index.ts`, виджет автоматически появляется в системе.

## 🔄 Как работает синхронизация с Chrome

Синхронизация реализована оберткой `withChromeSync` для Zustand-сторов.

### Принцип

1. Стор описывает `partialize` — какие поля нужно сохранять.
2. При `commit()` (или автоматической подписке, если `autoPersist=true`) состояние сериализуется в envelope:
   - `meta.originId` — источник записи
   - `meta.rev` — номер ревизии
   - `meta.ts` — timestamp
   - `state` — полезное состояние
3. Envelope пишется в `chrome.storage.local`.
4. Через `chrome.storage.onChanged` стор получает внешние обновления.
5. Конфликты/повторы режутся по `originId` и `rev`.

### Важные особенности

- В проекте используется `chrome.storage.local`, а не `sync`.
- В `widget`-сторе `autoPersist: false`, поэтому запись делается вручную через `commit()`.
- Схемы Zod (`makeEnvelopeSchema`) валидируют входящие данные из storage и защищают от поврежденного состояния.

## 🧪 Полный гайд: как сделать свой виджет

Ниже — минимальный рабочий путь для стороннего разработчика.

### Шаг 1. Создайте папку виджета

Пример:

```text
src/widgets/Weather/
```

### Шаг 2. Реализуйте React-компонент

`src/widgets/Weather/WeatherWidget.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'

export function WeatherWidget() {
  const [city, setCity] = useState('')

  const openSearch = () => {
    const q = city.trim()
    if (!q) return

    const url = `https://www.google.com/search?q=${encodeURIComponent(`weather ${q}`)}`
    chrome.tabs?.create?.({ url }) ?? window.open(url, '_blank')
  }

  return (
    <div className="flex items-center gap-2">
      <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Введите город" />
      <Button onClick={openSearch}>Погода</Button>
    </div>
  )
}
```

> Рекомендация: тексты в виджете выносите в отдельные JSON-файлы в `src/i18n/resources/<lang>/` по смысловым namespace и получайте через `useTranslation`.

### Шаг 3. Добавьте `index.ts` с `meta` и `Component`

`src/widgets/Weather/index.ts`:

```ts
import { WidgetMeta } from '@/types/widgets.ts'
import { WeatherWidget } from './WeatherWidget.tsx'

export const meta = {
  widgetType: 'weather',
  title: 'Погода',
  description: 'Быстрый поиск прогноза',
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta

export const Component = WeatherWidget
```

### Шаг 4. Проверьте уникальность `widgetType`

`widgetType` должен быть уникальным среди всех виджетов. Если повторится, registry перезапишет запись.

### Шаг 5. Запустите приложение и добавьте виджет

После запуска `yarn dev` и перезагрузки расширения:

- виджет автоматически появится в списке «Добавить виджет»
- при добавлении создастся инстанс с layout из `meta.defaultLayout`

### Шаг 6. Если виджет хранит свои данные

Если вашему виджету нужно состояние (например, выбранный город), добавьте отдельный zustand-стор с `withChromeSync`:

- отдельный ключ в storage (`WEATHER_WIDGET_KEY`)
- `partialize` только нужных полей
- Zod-схему persisted-состояния

Предпочтительное размещение такого стора: внутри папки самого виджета, например `src/widgets/Weather/store.ts`. Это помогает держать виджет автономным и не раздувать глобальный `src/store/`, если состояние нужно только одному виджету.

Это даст восстановление данных после перезапуска браузера/расширения.

## 🔐 Разрешения Chrome: что обязательно учитывать

В `manifest.config.ts` уже заявлены разрешения:

- `storage` — обязательно для синхронизации и сохранения сторов
- `tabs` — нужно для открытия новых вкладок (`chrome.tabs.create`)
- `sidePanel`, `contentSettings` — используются инфраструктурой проекта

### Правила для разработки новых виджетов

1. **Принцип минимально необходимых разрешений**: не добавляйте новые permissions без реальной необходимости.
2. Если ваш виджет использует API Chrome (например, `bookmarks`, `history`, `alarms`) — добавьте permission в манифест и обновите документацию.
3. Проверяйте fallback-поведение, если API недоступен (`chrome.*` может быть `undefined` вне extension context).
4. Помните, что изменение permissions влияет на UX установки/обновления (Chrome показывает пользователю новые требования доступа).

## 💡 Практические рекомендации для сторонних разработчиков

- Держите виджет автономным: одна папка, локальные компоненты, `index.ts` как точка входа.
- Если состояние используется только виджетом, храните store рядом с ним в `src/widgets/<Name>/`, а не в глобальном `src/store/`.
- Если логика работы с Chrome API может пригодиться нескольким виджетам, выносите её в `src/services/chrome/`, а не дублируйте в компонентах и сторах.
- Не храните тяжелые бинарные данные в `chrome.storage.local`.
- Валидируйте внешние данные (API-ответы) перед сохранением.
- Не полагайтесь на порядок загрузки виджетов — registry формируется динамически.
- Для совместимости держите layout-ограничения (`minW`, `minH`, `maxW`, `maxH`) явными.
- Для `react-grid-layout` прямым ребёнком грида должен быть DOM-элемент с ключом, совпадающим с `layout.i`. Не передавайте кастомный React-компонент как единственный child без обёртки, иначе drag/resize и размеры могут работать некорректно.

## ✅ Чеклист при добавлении нового виджета

- [ ] Создана папка `src/widgets/<Name>/`
- [ ] Есть `index.ts` с `meta` и `Component`
- [ ] `widgetType` уникален
- [ ] Корректно заполнен `defaultLayout`
- [ ] Нужные Chrome permissions учтены
- [ ] Есть fallback при отсутствии нужного `chrome.*` API
- [ ] Проверено добавление/удаление виджета в UI
- [ ] Проверено восстановление состояния после перезагрузки расширения

## 🧰 Полезные команды

```bash
yarn dev
yarn build
```

---

# 🇬🇧 English version

## RSTP New Tab Chrome Extension 🚀

This extension replaces Chrome's default new tab with a customizable page that supports widgets, background settings, and UI preferences.

### Table of contents

- [🌐 i18n](#-i18n-new)
- [🛠️ Tech stack](#️-tech-stack)
- [⚡ Quick start](#-quick-start)
- [🧩 Architecture](#-architecture-for-third-party-developers)
- [🔄 Chrome sync model](#-chrome-sync-model)
- [🧪 Full guide: create your own widget](#-full-guide-create-your-own-widget)
- [🔐 Chrome permissions](#-chrome-permissions-must-consider)
- [💡 Practical recommendations](#-practical-recommendations)
- [✅ New widget checklist](#-new-widget-checklist)

### 🌐 i18n (new)

- Added i18n infrastructure in `src/i18n/`.
- Widget translations are stored as `src/i18n/resources/<lang>/widgets/<widget>.json`.
- Supported languages: `English` and `Russian`.
- Default language: `English`.
- Selected language is stored in the header store (`language`) and can be changed in `SettingsDialog`.
- `newtab/search widget` is used as the translation example.
- Dedicated translation keys were added for page-level errors and widget-level errors.

## 🛠️ Tech stack

- React + TypeScript
- Vite + CRXJS (`@crxjs/vite-plugin`) for extension builds
- Zustand for state management
- `chrome.storage.local` for persistence and cross-context synchronization

## ⚡ Quick start

1. Install dependencies:

```bash
yarn install
```

2. Run development build:

```bash
yarn dev
```

3. Open `chrome://extensions/` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the `dist` folder.

Production build:

```bash
yarn build
```

## 🧩 Architecture for third-party developers

### Key folders

- `manifest.config.ts` — extension manifest and Chrome permissions.
- `src/newtab/` — new-tab UI.
- `src/store/` — Zustand stores.
- `src/services/chrome/` — `chrome.storage` integration and sync layer.
- `src/types/widgets.ts` — widget types and `widgetRegistry`.
- `src/widgets/*` — widget implementations (one folder per widget).

### How `widget registry` works

Widgets are auto-discovered via:

```ts
import.meta.glob('../widgets/*/index.ts', { eager: true })
```

Every `src/widgets/<WidgetName>/index.ts` must export:

- `meta` (`WidgetMeta`) — widget metadata
- `Component` — widget React component

The app builds `widgetRegistry` from `meta.widgetType`. This registry is used by:

- Add widget dialog
- Widget instance factory (`createWidgetInstance`)
- Runtime renderer (`renderWidget`)
- Store schema validation (enum from registry keys)

If the folder and exports are correct, a new widget is picked up automatically.

## 🔄 Chrome sync model

Synchronization uses the `withChromeSync` wrapper around Zustand stores.

### Flow

1. A store defines `partialize` (what should be persisted).
2. On `commit()` (or auto-write if `autoPersist=true`), state is wrapped into an envelope:
   - `meta.originId` — write source ID
   - `meta.rev` — monotonic revision number
   - `meta.ts` — timestamp
   - `state` — persisted payload
3. Envelope is written to `chrome.storage.local`.
4. Remote updates are received via `chrome.storage.onChanged`.
5. Duplicate/old updates are ignored using `originId` and `rev`.

### Important notes

- The project uses `chrome.storage.local` (not `sync`).
- Widget store uses `autoPersist: false`, so writes happen through manual `commit()` calls.
- Zod schemas validate incoming storage payloads before merge.

## 🧪 Full guide: create your own widget

### 1) Create widget folder

```text
src/widgets/Weather/
```

### 2) Implement component

`src/widgets/Weather/WeatherWidget.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'

export function WeatherWidget() {
  const [city, setCity] = useState('')

  const openSearch = () => {
    const q = city.trim()
    if (!q) return

    const url = `https://www.google.com/search?q=${encodeURIComponent(`weather ${q}`)}`
    chrome.tabs?.create?.({ url }) ?? window.open(url, '_blank')
  }

  return (
    <div className="flex items-center gap-2">
      <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Enter city" />
      <Button onClick={openSearch}>Weather</Button>
    </div>
  )
}
```

### 3) Add `index.ts` with `meta` + `Component`

`src/widgets/Weather/index.ts`:

```ts
import { WidgetMeta } from '@/types/widgets.ts'
import { WeatherWidget } from './WeatherWidget.tsx'

export const meta = {
  widgetType: 'weather',
  title: 'Weather',
  description: 'Quick forecast lookup',
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta

export const Component = WeatherWidget
```

### 4) Keep `widgetType` unique

`widgetType` must be unique across all widgets. Duplicates can overwrite entries in the registry map.

### 5) Run and add widget

After `yarn dev` and extension reload:

- the widget should appear in “Add widget” dialog
- adding it creates an instance with `meta.defaultLayout`

### 6) Persist widget-specific state (optional)

If your widget stores settings/data (e.g., selected city), create a dedicated Zustand store with `withChromeSync`:

- unique storage key (`WEATHER_WIDGET_KEY`)
- strict `partialize`
- Zod schema for persisted state

Preferred placement for that store is inside the widget folder itself, for example `src/widgets/Weather/store.ts`. This keeps widget-specific logic local and avoids overloading the global `src/store/` directory.

This ensures restore after browser/extension reload.

## 🔐 Chrome permissions (must consider)

Current manifest permissions include:

- `storage` — required for synchronized persistence
- `tabs` — required for opening tabs (`chrome.tabs.create`)
- `sidePanel`, `contentSettings` — project-level capabilities

### Permission rules for new widgets

1. Apply least-privilege principle: only request permissions you actually need.
2. If your widget uses new Chrome APIs (`bookmarks`, `history`, `alarms`, etc.), update `manifest.config.ts` and docs.
3. Add fallback behavior when `chrome.*` APIs are unavailable.
4. Remember that new permissions affect installation/update consent UX.

## 💡 Practical recommendations

- Keep each widget self-contained (own folder + local logic + clean `index.ts`).
- If state is only used by one widget, keep its store inside `src/widgets/<Name>/` instead of the global `src/store/`.
- If Chrome API logic can be reused across widgets, move it into `src/services/chrome/` instead of duplicating it inside components or stores.
- Avoid storing large binary payloads in `chrome.storage.local`.
- Validate external API responses before persistence.
- Do not rely on load order: registry is built dynamically.
- Define layout constraints (`minW`, `minH`, `maxW`, `maxH`) explicitly.
- With `react-grid-layout`, the direct child of the grid must be a DOM element whose key matches `layout.i`. Wrapping content incorrectly can break sizing, dragging, and resizing behavior.

## ✅ New widget checklist

- [ ] Folder created: `src/widgets/<Name>/`
- [ ] `index.ts` exports `meta` and `Component`
- [ ] Unique `widgetType`
- [ ] Correct `defaultLayout`
- [ ] Required Chrome permissions reviewed
- [ ] Fallbacks for missing `chrome.*` API
- [ ] Add/remove flow tested in UI
- [ ] State restore tested after extension reload
