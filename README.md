# RSTP New Tab Chrome Extension 🚀

📚 **Выберите язык / Choose your language:**  
[🇷🇺 Русская версия](#-русская-версия) | [🇬🇧 English version](#-english-version)

## 🇷🇺 Русская версия

Расширение заменяет стандартную вкладку Chrome на кастомную страницу с настраиваемыми виджетами, фоном и настройками интерфейса.

### Оглавление

- [🌐 i18n](#-i18n-новое)
- [🛠️ Технологии проекта](#️-технологии-проекта)
- [⚡ Быстрый старт](#-быстрый-старт)
- [🧪 Тестирование](#-тестирование)
- [🧩 Архитектура](#-архитектура-для-стороннего-разработчика)
- [🔄 Как работает синхронизация с Chrome](#-как-работает-синхронизация-с-chrome)
- [🧪 Полный гайд: как сделать свой виджет](#-полный-гайд-как-сделать-свой-виджет)
- [🔌 Свой интегратор для Todo-виджета](#-свой-интегратор-для-todo-виджета)
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

Showcase (без установки расширения):

```bash
yarn build:showcase
yarn preview:showcase
```

Для showcase используется режим `VITE_RUNTIME_MODE=showcase` и демо-данные вместо Chrome API.

## 🧪 Тестирование

- Unit/Component тесты: `yarn test`
- Coverage (покрытие unit/component тестов Vitest): `yarn test:coverage`
- Playwright smoke: `yarn test:smoke:local`
- Playwright smoke в CI/headed Linux: `yarn test:smoke:ci`
- Перед browser-тестами один раз соберите расширение: `yarn build`
- Extension screenshot tests (Playwright): `yarn test:extension:local`
- Playwright UI mode для browser-тестов: `yarn test:extension:ui`
- Extension screenshot tests в CI/headed Linux: `yarn test:extension:ci`
- Обновление baseline скриншотов локально: `yarn test:extension:update-snapshots`
- Обновление baseline скриншотов в CI/headed Linux: `yarn test:extension:update-snapshots:ci`
- Baseline PNG хранятся отдельно по средам:
  - `chromium-mac` для локального macOS-прогона
  - `chromium-ci` для Linux CI-прогона
- Snapshot-пути формирует сам Playwright внутри папок с тестами, и эти PNG коммитятся в Git.
- Спеки интерактивных сценариев виджетов лежат рядом с виджетами: `src/widgets/*/test/*.scenario.spec.ts`.
- Browser job в GitHub Actions публикует скачиваемые артефакты: `playwright-report/` и `test-results/`.
- Для пересъёма Linux CI-baselines есть отдельный manual workflow: `Update Visual Snapshots`.
- Артефакт `playwright-snapshots-ci` уже упакован с путями относительно корня репозитория, поэтому его можно просто распаковать поверх проекта и закоммитить обновлённые папки `chromium-ci`.

Тестовые файлы хранятся так:

- Тесты виджетов: `src/widgets/<WidgetName>/test/`
- Общие unit/contract/store тесты: `tests/unit/`, `tests/contracts/`, `tests/stores/`
- Общая тестовая инфраструктура: `tests/constants/`, `tests/fixtures/`, `tests/helpers/`, `tests/mocks/`, `tests/setup.ts`
- Browser-тесты новой вкладки: `tests/smoke/` и `tests/extension/`

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
- `PreviewComponent` — необязательный React-компонент превью для диалога добавления виджета

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

### Шаг 4. Добавьте `PreviewComponent` для preview в диалоге

Если виджет должен красиво отображаться в диалоге добавления, экспортируйте отдельный preview-компонент.

`src/widgets/Weather/WeatherWidgetPreview.tsx`:

```tsx
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'

export function WeatherWidgetPreview() {
  return (
    <WidgetFrame title="Погода" pinned={false}>
      <div className="flex items-center gap-2">
        <Input disabled value="" placeholder="Введите город" />
        <Button disabled>Погода</Button>
      </div>
    </WidgetFrame>
  )
}
```

И подключите его в `src/widgets/Weather/index.ts`:

```ts
import { WidgetMeta } from '@/types/widgets.ts'
import { WeatherWidget } from './WeatherWidget.tsx'
import { WeatherWidgetPreview } from './WeatherWidgetPreview.tsx'

export const meta = {
  widgetType: 'weather',
  title: 'Погода',
  description: 'Быстрый поиск прогноза',
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta

export const Component = WeatherWidget
export const PreviewComponent = WeatherWidgetPreview
```

### Рекомендации по preview-компоненту

- Делайте preview упрощенным и статичным: это шаблон, а не полноценный live-виджет.
- Не используйте в preview побочные эффекты, `chrome.*`, сетевые запросы и запись в store.
- По возможности визуально переиспользуйте `WidgetFrame` и знакомые элементы из боевого виджета.
- Используйте `disabled`-состояния и mock-данные, чтобы показать структуру виджета без настоящего интерактива.
- Держите preview компактным: он должен хорошо смотреться в узкой плавающей панели рядом с модалкой.
- Если у виджета нет `PreviewComponent`, диалог покажет fallback-превью с заголовком и описанием.

### Шаг 5. Проверьте уникальность `widgetType`

`widgetType` должен быть уникальным среди всех виджетов. Если повторится, registry перезапишет запись.

### Шаг 6. Запустите приложение и добавьте виджет

После запуска `yarn dev` и перезагрузки расширения:

- виджет автоматически появится в списке «Добавить виджет»
- при добавлении создастся инстанс с layout из `meta.defaultLayout`
- если экспортирован `PreviewComponent`, он будет показан в hover-preview рядом с диалогом

### Шаг 7. Если виджет хранит свои данные

Если вашему виджету нужно состояние (например, выбранный город), добавьте отдельный zustand-стор с `withChromeSync`:

- отдельный ключ в storage (`WEATHER_WIDGET_KEY`)
- `partialize` только нужных полей
- Zod-схему persisted-состояния

Предпочтительное размещение такого стора: внутри папки самого виджета, например `src/widgets/Weather/store.ts`. Это помогает держать виджет автономным и не раздувать глобальный `src/store/`, если состояние нужно только одному виджету.

Это даст восстановление данных после перезапуска браузера/расширения.

## 🔌 Свой интегратор для Todo-виджета

Todo-виджет умеет синхронизироваться с внешними сервисами через модульную систему интеграций. В коробке поставляется один интегратор — Trello (`src/widgets/Todo/integrations/trello/`), а добавление нового сводится к написанию одной папки.

### Принципы

- Каждая интеграция живёт в `src/widgets/Todo/integrations/<name>/` и **знает про сущности Todo** (`TodoTask`, `TodoStatus`, `Project`). Это не generic-абстракция — вы пишете адаптер именно под Todo-виджет.
- Реестр строится автоматически через `import.meta.glob('./*/index.ts', { eager: true })` в `src/widgets/Todo/integrations/index.ts`. Достаточно положить новую папку и экспортнуть `descriptor` — она появится в picker'е настроек.
- Активная интеграция в каждый момент времени **одна**. Конфиг хранится в Zustand-сторе под ключом `todo-widget:v1` через тот же `withChromeSync` envelope, что и сами тудушки.
- Вызовы к бэкенду делаются **только** при монтировании виджета и при действиях пользователя — никаких background/alarms. Кнопка «Sync now» есть в футере виджета.

### Шаг 1. Создайте папку

```text
src/widgets/Todo/integrations/myservice/
  index.ts          # descriptor + класс адаптера
  client.ts         # HTTP-клиент
  schema.ts         # zod-схемы ответов API
  mapping.ts        # перевод remote ↔ TodoTask
  types.ts          # MyServiceConfig + остальные публичные типы
  constants.ts      # API base, ссылки и т.п.
  MyServiceConnectForm.tsx  # форма авторизации
```

Сама папка ничего больше от вас не требует — registry подцепит её на следующем билде.

### Шаг 2. Реализуйте контракт `TodoIntegration`

`src/widgets/Todo/integrations/types.ts`:

```ts
export interface TodoIntegration {
  connect(): Promise<IntegrationOutcome<{ userHandle: string }>>
  disconnect(): void

  listBoards(): Promise<IntegrationOutcome<RemoteBoard[]>>
  listLists(boardId: string): Promise<IntegrationOutcome<RemoteList[]>>
  listProjects(boardId: string): Promise<IntegrationOutcome<Project[]>>

  pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>>
  pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>>
}
```

Все методы возвращают `IntegrationOutcome<T>` — дискриминированный union `{ ok: true, value }` либо `{ ok: false, errorKey }`. Бросать исключения не нужно — клиент должен ловить сетевые ошибки и переводить их в `IntegrationErrorKey` (`authInvalid`, `network`, `rateLimited`, `notFound`, `mappingIncomplete`, `pushFailed`, `pullFailed`, `unknown`).

Класс-имплементация (Trello как образец):

```ts
export class MyIntegration implements TodoIntegration {
  private readonly client: MyClient
  constructor(config: MyServiceConfig) {
    this.client = new MyClient(config.apiKey, config.token)
  }

  async connect() {
    /* GET /me + zod-парс → ok / authInvalid */
  }
  disconnect() {
    /* in-memory cleanup, без I/O */
  }
  listBoards() {
    /* список board'ов пользователя */
  }
  listLists(boardId) {
    /* колонок для выбранной доски */
  }
  listProjects(boardId) {
    /* проектов = labels */
  }
  pullTasks(ctx) {
    /* getAllCards + cardToTask + reconcile */
  }
  pushTask(task, op, ctx) {
    /* create/update/move в зависимости от op.kind */
  }
}
```

### Шаг 3. Маппинг статусов и проектов

- **Статус задачи**: пользователь в настройках сопоставляет каждый из 5 статусов (`input`, `inprogress`, `struggle`, `completed`, `deleted`) с массивом колонок вашего сервиса. Первая колонка в массиве — **primary**, туда уходит push при смене статуса. На pull-стороне колонка, не попавшая ни в один массив, по умолчанию читается как `input` (helper-функция `statusForListId`, см. `trello/mapping.ts`).
- **Проект задачи**: один проект на задачу (`Project.id`). Адаптер сам решает, что считать «проектом» — у Trello это label, у Notion может быть multi-select option. **Цвет проекта** вы рассчитываете один раз при создании `Project` и кладёте в поле `pillClassName` (готовая Tailwind-строка). Так `<ProjectPill>` остаётся провайдер-агностичным. Образец — `trello/projectStyles.ts`.

### Шаг 4. Скрытые метаданные на стороне сервиса

Часто нужно сохранить локальный `taskId` где-то в карточке, чтобы при следующем pull смержить её с локальной задачей. В Trello-адаптере это сделано через HTML-комментарий в конце `card.desc`:

```text
<пользовательский текст>

<!-- newtab-todo:v1
{"version":1,"localId":"…","createdAt":…,"statusChangedAt":…}
-->
```

Helpers `parseHiddenMetadata` / `writeHiddenMetadata` в `trello/mapping.ts` — готовый рецепт. Если ваш сервис умеет в нативные custom fields — используйте их вместо комментария.

### Шаг 5. Соберите `descriptor`

`src/widgets/Todo/integrations/myservice/index.ts`:

```ts
export const descriptor: IntegrationDescriptor = {
  name: 'myservice', // discriminator в persisted state
  titleI18nKey: 'todoWidget:integrations.myservice.title',
  descriptionI18nKey: 'todoWidget:integrations.myservice.description',
  ConnectForm: MyServiceConnectForm,
  create: (config) => new MyIntegration(config as MyServiceConfig),
}
```

Поле `name` должно быть уникальным — registry индексируется по нему.

### Шаг 6. Реализуйте `ConnectForm`

Это React-компонент с props `{ busy, errorKey, onConnect }`. Вызовите `onConnect(config)` после валидации полей. Само сохранение конфига и инициализация адаптера сделаны в Zustand-сторе:

```tsx
export function MyServiceConnectForm({ busy, errorKey, onConnect }: ConnectFormProps) {
  // ...inputs...
  const handleSubmit = () => {
    void onConnect({ apiKey, token, boardId: null } satisfies MyServiceConfig)
  }
  // ...
}
```

### Шаг 7. Добавьте i18n-ключи

В оба файла `src/i18n/resources/{en,ru}/widgets/todoWidget.json` добавьте namespace `integrations.<name>.*` с теми же ключами, что есть у Trello (`title`, `description`, `connect.*`, `board.*`, `mapping.*`, `summary.*`, `errors.*`, `showcase.*`). Контракт-тест `tests/contracts/i18nKeys.test.ts` падает, если EN и RU расходятся.

### Шаг 8. Подключите диспетчер в `TodoSettingsConnect`

Сейчас `TodoSettingsConnect.tsx` содержит `switch (integrationName)` и явный case для Trello:

```ts
switch (integrationName) {
  case 'trello':
    await connectIntegration('trello', config as TrelloConfig)
    return
  case 'myservice':
    await connectIntegration('myservice', config as MyServiceConfig)
    return
  default:
    console.warn(`...`)
}
```

Это известная временная связка между диалогом и сторами — будет отрефакторено в типизированный реестр, как только появится вторая интеграция (пока в коде один путь — Trello).

### Чеклист новой интеграции

- [ ] Папка `src/widgets/Todo/integrations/<name>/` создана
- [ ] Класс `MyIntegration implements TodoIntegration` реализует все 7 методов
- [ ] HTTP-клиент возвращает `IntegrationOutcome<T>`, не бросает исключений
- [ ] Все ответы API валидируются через Zod (`schema.ts`)
- [ ] Секреты не утекают в текст ошибок (см. `redact` в `trello/client.ts`)
- [ ] `Project.pillClassName` рассчитан один раз в адаптере
- [ ] Скрытые метаданные сохраняют `localId` (или эквивалент) для reconciliation
- [ ] `descriptor.name` уникален
- [ ] i18n-ключи добавлены в EN и RU, контракт-тест зелёный
- [ ] Switch в `TodoSettingsConnect.tsx` дополнен новым case
- [ ] Интеграция показывается в picker'е настроек после `yarn dev`
- [ ] Ручной smoke-тест: connect → board → mapping → создать таску → переместить в сервисе → sync now

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
- [ ] При необходимости добавлен `PreviewComponent`
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
- [🧪 Testing](#-testing)
- [🧩 Architecture](#-architecture-for-third-party-developers)
- [🔄 Chrome sync model](#-chrome-sync-model)
- [🧪 Full guide: create your own widget](#-full-guide-create-your-own-widget)
- [🔌 Writing your own Todo integration](#-writing-your-own-todo-integration)
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

Showcase build (no extension install required):

```bash
yarn build:showcase
yarn preview:showcase
```

Showcase runs with `VITE_RUNTIME_MODE=showcase` and uses demo data instead of live Chrome APIs.

## 🧪 Testing

- Unit/Component tests: `yarn test`
- Coverage (Vitest unit/component suites): `yarn test:coverage`
- Playwright smoke: `yarn test:smoke:local`
- Playwright smoke in CI/headed Linux: `yarn test:smoke:ci`
- Before browser tests, build the extension once: `yarn build`
- Extension screenshot tests (Playwright): `yarn test:extension:local`
- Playwright UI mode for browser tests: `yarn test:extension:ui`
- Extension screenshot tests in CI/headed Linux: `yarn test:extension:ci`
- Update baseline screenshots locally: `yarn test:extension:update-snapshots`
- Update baseline screenshots in CI/headed Linux: `yarn test:extension:update-snapshots:ci`
- Baseline PNG files are stored separately per environment:
  - `chromium-mac` for local macOS runs
  - `chromium-ci` for Linux CI runs
- Playwright generates snapshot paths inside the test folders, and those PNG files are committed to Git.
- Widget interaction scenario specs live next to widgets under `src/widgets/*/test/*.scenario.spec.ts`.
- GitHub Actions browser job uploads downloadable artifacts: `playwright-report/` and `test-results/`.
- There is also a dedicated manual workflow for regenerating Linux CI baselines: `Update Visual Snapshots`.
- The `playwright-snapshots-ci` artifact is packaged with repository-relative paths, so you can unpack it over the repo and commit the updated `chromium-ci` folders directly.

Test file placement:

- Widget tests: `src/widgets/<WidgetName>/test/`
- Shared unit/contract/store tests: `tests/unit/`, `tests/contracts/`, `tests/stores/`
- Shared test infrastructure: `tests/constants/`, `tests/fixtures/`, `tests/helpers/`, `tests/mocks/`, `tests/setup.ts`
- New tab browser tests: `tests/smoke/` and `tests/extension/`

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
- `PreviewComponent` — optional React preview component for the add-widget dialog

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

### 4) Add `PreviewComponent` for dialog preview

If you want the widget to render nicely inside the add-widget dialog, export a dedicated preview component.

`src/widgets/Weather/WeatherWidgetPreview.tsx`:

```tsx
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'

export function WeatherWidgetPreview() {
  return (
    <WidgetFrame title="Weather" pinned={false}>
      <div className="flex items-center gap-2">
        <Input disabled value="" placeholder="Enter city" />
        <Button disabled>Weather</Button>
      </div>
    </WidgetFrame>
  )
}
```

Then wire it in `src/widgets/Weather/index.ts`:

```ts
import { WidgetMeta } from '@/types/widgets.ts'
import { WeatherWidget } from './WeatherWidget.tsx'
import { WeatherWidgetPreview } from './WeatherWidgetPreview.tsx'

export const meta = {
  widgetType: 'weather',
  title: 'Weather',
  description: 'Quick forecast lookup',
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta

export const Component = WeatherWidget
export const PreviewComponent = WeatherWidgetPreview
```

### Preview component recommendations

- Keep previews simplified and static: they are templates, not live widgets.
- Do not use side effects, `chrome.*`, network calls, or store writes inside previews.
- Reuse `WidgetFrame` and visual patterns from the real widget whenever possible.
- Prefer disabled controls and mock data to show the widget structure safely.
- Keep the preview compact so it fits well into the narrow floating panel next to the dialog.
- If a widget does not export `PreviewComponent`, the dialog falls back to a generic title/description preview.

### 5) Keep `widgetType` unique

`widgetType` must be unique across all widgets. Duplicates can overwrite entries in the registry map.

### 6) Run and add widget

After `yarn dev` and extension reload:

- the widget should appear in “Add widget” dialog
- adding it creates an instance with `meta.defaultLayout`
- if `PreviewComponent` is exported, it appears in the hover preview next to the dialog

### 7) Persist widget-specific state (optional)

If your widget stores settings/data (e.g., selected city), create a dedicated Zustand store with `withChromeSync`:

- unique storage key (`WEATHER_WIDGET_KEY`)
- strict `partialize`
- Zod schema for persisted state

Preferred placement for that store is inside the widget folder itself, for example `src/widgets/Weather/store.ts`. This keeps widget-specific logic local and avoids overloading the global `src/store/` directory.

This ensures restore after browser/extension reload.

## 🔌 Writing your own Todo integration

The Todo widget can sync with external services through a modular integration system. Trello (`src/widgets/Todo/integrations/trello/`) ships in the box; adding a new backend is a one-folder drop-in.

### Principles

- Each integration lives under `src/widgets/Todo/integrations/<name>/` and **knows about Todo entities** (`TodoTask`, `TodoStatus`, `Project`). It is not a generic abstraction — you write an adapter specifically for the Todo widget.
- The registry is built automatically via `import.meta.glob('./*/index.ts', { eager: true })` in `src/widgets/Todo/integrations/index.ts`. Drop a folder, export `descriptor`, and it appears in the settings picker.
- At any moment **one** integration is active. Its config is persisted in the Zustand store under `todo-widget:v1` using the same `withChromeSync` envelope as the todos themselves.
- Backend calls happen **only** on widget mount and on user actions — there is no background or alarms loop. A "Sync now" button lives in the widget footer.

### Step 1. Create the folder

```text
src/widgets/Todo/integrations/myservice/
  index.ts          # descriptor + adapter class
  client.ts         # HTTP wrapper
  schema.ts         # Zod schemas for API responses
  mapping.ts        # remote ↔ TodoTask conversions
  types.ts          # MyServiceConfig + other public types
  constants.ts      # API base URL, links, etc.
  MyServiceConnectForm.tsx  # auth UI
```

That's the only required structure — the registry will pick it up on the next build.

### Step 2. Implement the `TodoIntegration` contract

`src/widgets/Todo/integrations/types.ts`:

```ts
export interface TodoIntegration {
  connect(): Promise<IntegrationOutcome<{ userHandle: string }>>
  disconnect(): void

  listBoards(): Promise<IntegrationOutcome<RemoteBoard[]>>
  listLists(boardId: string): Promise<IntegrationOutcome<RemoteList[]>>
  listProjects(boardId: string): Promise<IntegrationOutcome<Project[]>>

  pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>>
  pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>>
}
```

Every method returns `IntegrationOutcome<T>` — a discriminated union of `{ ok: true, value }` or `{ ok: false, errorKey }`. Don't throw — your client should catch network failures and translate them to one of the `IntegrationErrorKey` literals (`authInvalid`, `network`, `rateLimited`, `notFound`, `mappingIncomplete`, `pushFailed`, `pullFailed`, `unknown`).

Class implementation (Trello as the reference):

```ts
export class MyIntegration implements TodoIntegration {
  private readonly client: MyClient
  constructor(config: MyServiceConfig) {
    this.client = new MyClient(config.apiKey, config.token)
  }

  async connect() {
    /* GET /me + zod parse → ok / authInvalid */
  }
  disconnect() {
    /* in-memory cleanup, no I/O */
  }
  listBoards() {
    /* user's boards */
  }
  listLists(boardId) {
    /* lists for the chosen board */
  }
  listProjects(boardId) {
    /* projects = labels in Trello's case */
  }
  pullTasks(ctx) {
    /* getAllCards + cardToTask + reconcile */
  }
  pushTask(task, op, ctx) {
    /* create/update/move based on op.kind */
  }
}
```

### Step 3. Status and project mapping

- **Task status**: in the settings dialog the user maps each of the 5 statuses (`input`, `inprogress`, `struggle`, `completed`, `deleted`) to an array of remote columns. The first column in the array is the **primary** — that's where push lands when the status changes. On the pull side, any column not present in any array falls back to `input` (helper `statusForListId`, see `trello/mapping.ts`).
- **Task project**: one project per task (`Project.id`). The adapter decides what counts as a "project" — Trello uses labels, Notion might use a multi-select option. **Project color** is computed once when you build the `Project` record and stored in `pillClassName` (a ready-to-use Tailwind class string), so `<ProjectPill>` stays provider-agnostic. See `trello/projectStyles.ts` for the reference table.

### Step 4. Hidden metadata on the remote side

You usually need to stash a local `taskId` somewhere on the remote record so the next pull can merge it back into the local task. The Trello adapter does this with an HTML comment at the end of `card.desc`:

```text
<user free-form description>

<!-- newtab-todo:v1
{"version":1,"localId":"…","createdAt":…,"statusChangedAt":…}
-->
```

Helpers `parseHiddenMetadata` / `writeHiddenMetadata` in `trello/mapping.ts` are a ready-to-use recipe. If your service supports native custom fields, prefer those over a description blob.

### Step 5. Build the `descriptor`

`src/widgets/Todo/integrations/myservice/index.ts`:

```ts
export const descriptor: IntegrationDescriptor = {
  name: 'myservice', // discriminator in persisted state
  titleI18nKey: 'todoWidget:integrations.myservice.title',
  descriptionI18nKey: 'todoWidget:integrations.myservice.description',
  ConnectForm: MyServiceConnectForm,
  create: (config) => new MyIntegration(config as MyServiceConfig),
}
```

`name` must be unique — the registry is keyed on it.

### Step 6. Implement the `ConnectForm`

A small React component with props `{ busy, errorKey, onConnect }`. Call `onConnect(config)` once the inputs validate. The store handles persisting the config and instantiating the adapter:

```tsx
export function MyServiceConnectForm({ busy, errorKey, onConnect }: ConnectFormProps) {
  // ...inputs...
  const handleSubmit = () => {
    void onConnect({ apiKey, token, boardId: null } satisfies MyServiceConfig)
  }
  // ...
}
```

### Step 7. Add i18n keys

Add an `integrations.<name>.*` namespace to both `src/i18n/resources/en/widgets/todoWidget.json` and `.../ru/widgets/todoWidget.json`, mirroring the Trello shape (`title`, `description`, `connect.*`, `board.*`, `mapping.*`, `summary.*`, `errors.*`, `showcase.*`). The contract test `tests/contracts/i18nKeys.test.ts` fails on EN/RU drift.

### Step 8. Wire the dispatcher in `TodoSettingsConnect`

`TodoSettingsConnect.tsx` currently has a `switch (integrationName)` with one explicit case:

```ts
switch (integrationName) {
  case 'trello':
    await connectIntegration('trello', config as TrelloConfig)
    return
  case 'myservice':
    await connectIntegration('myservice', config as MyServiceConfig)
    return
  default:
    console.warn(`...`)
}
```

This is a known temporary coupling between the dialog and the store — it will be refactored into a typed registry once a second integration shows up (right now there's only one path: Trello).

### New integration checklist

- [ ] Folder `src/widgets/Todo/integrations/<name>/` created
- [ ] `MyIntegration implements TodoIntegration` covers all seven methods
- [ ] HTTP client returns `IntegrationOutcome<T>`, never throws on expected failures
- [ ] All API responses validated through Zod (`schema.ts`)
- [ ] Secrets are redacted from error messages (see `redact` in `trello/client.ts`)
- [ ] `Project.pillClassName` is computed once inside the adapter
- [ ] Hidden metadata preserves `localId` (or equivalent) for reconciliation
- [ ] `descriptor.name` is unique
- [ ] i18n keys exist in EN and RU, contract test green
- [ ] `TodoSettingsConnect.tsx` switch has a case for the new integration
- [ ] Integration shows up in the settings picker after `yarn dev`
- [ ] Manual smoke test: connect → board → mapping → create a task → move it on the remote → sync now

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
- [ ] `PreviewComponent` added when a custom preview is needed
- [ ] Unique `widgetType`
- [ ] Correct `defaultLayout`
- [ ] Required Chrome permissions reviewed
- [ ] Fallbacks for missing `chrome.*` API
- [ ] Add/remove flow tested in UI
- [ ] State restore tested after extension reload
