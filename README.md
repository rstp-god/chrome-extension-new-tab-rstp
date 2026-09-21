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
- `src/popup/` — popup расширения (Tab Rules Engine).
- `src/background/` — background service worker (применение правил, cleanup).
- `src/i18n/` — словари переводов и функция получения строки по ключу.
- `src/store/` — Zustand-сторы приложения.
- `src/services/chrome/` — работа с `chrome.storage` и синхронизация.
- `src/types/widgets.ts` — типы виджетов и `widgetRegistry`.
- `src/widgets/*` — сами виджеты (по папке на виджет).

### Tab Rules Engine (popup)

Popup расширения предоставляет движок автоматической группировки, сортировки и очистки вкладок.

**Основные возможности:**

- **Grouping Rules** — правила группировки табов по домену, regex, заголовку или пути. Правила применяются сверху вниз (first match wins), поддерживают drag-and-drop для изменения приоритета.
- **Sorting** — сортировка табов (по домену, заголовку, последнему доступу, URL) и групп (по имени, количеству табов). Scope: Off / Window / Global (перемещение между окнами).
- **Cleanup** — автоматическое закрытие неактивных табов (1d-28d), с режимами «спросить» (через Chrome Notifications) и «автоматически».
- **Automation** — режимы работы: Realtime (применение на каждое событие таба), Delayed (с дебаунсом) и Manual (по кнопке Apply Now).

**Архитектура:**

- `src/popup/types/rules.ts` — типы, константы, дефолты
- `src/popup/services/` — pure-функции pipeline (matchers, grouping, sorting, pipeline orchestrator)
- `src/popup/utils/filter.ts` — фильтрация системных и закреплённых табов
- `src/popup/store/tabRules.ts` — Zustand store с `withChromeSync`
- `src/popup/components/` — React-компоненты popup UI
- `src/background/` — service worker: chromeAdapter, pipelineExecutor, eventListeners, messageHandler, cleanup (activityTracker, scheduler, notifications)

**Ключи storage:** `tabRules:v1`, `tabRules:activity`

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

  listScopes(): Promise<IntegrationOutcome<RemoteScopeOption[]>>
  listContainers(scope: RemoteScope): Promise<IntegrationOutcome<RemoteContainer[]>>
  listProjects(scope: RemoteScope): Promise<IntegrationOutcome<Project[]>>

  pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>>
  pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>>

  /** Необязательный: создать колонку внутри scope (нужен шагу маппинга, который достраивает колонки). */
  createContainer?(scope: RemoteScope, title: string): Promise<IntegrationOutcome<RemoteContainer>>
}
```

`RemoteScope` — это `Record<string, string | number>`, непрозрачный для стора адрес вашего списка задач: у Trello `{ boardId }`, у Vikunja `{ projectId, viewId }`. `listScopes` возвращает `RemoteScopeOption[]` (`{ scope, name }`) для шага выбора, `listContainers` — `RemoteContainer[]` (`{ id, name, isTerminal? }`), колонки/корзины внутри scope; `isTerminal` помечает собственную «готово»-колонку сервиса (у Trello такой нет — флаг не ставится). Выбранный scope приезжает в адаптер в `PullContext.scope` / `PushContext.scope`.

`PullContext` — это то, что стор знает о задачах на момент пулла:

```ts
export interface PullContext {
  scope: RemoteScope
  mapping: StatusListMapping
  /** Уже известные remoteRef, ключ — локальный id задачи. */
  knownRefs: Record<string, RemoteTaskRef>
  /** Текущий локальный статус каждой задачи, ключ — локальный id. */
  knownStatuses: Record<string, TodoStatus>
}
```

`knownStatuses` нужен только бэкендам, которые физически не умеют хранить все пять статусов (Vikunja в плоском режиме знает лишь `done` / не `done`): адаптер сохраняет локальный промежуточный статус вместо того, чтобы сбрасывать задачу в `input` на каждом пулле. Если ваши колонки сами несут статус — поле можно игнорировать, как это делает Trello.

Все методы возвращают `IntegrationOutcome<T>` — дискриминированный union `{ ok: true, value }` либо `{ ok: false, errorKey, ref? }`. Необязательный `ref` в ветке ошибки нужен для push'ей длиной в несколько запросов: если задача на бэкенде уже создана, а следующий запрос упал, верните её `RemoteTaskRef` вместе с ошибкой — стор запомнит ссылку и следующая синхронизация не создаст дубль. Бросать исключения не нужно — клиент должен ловить сетевые ошибки и переводить их в `IntegrationErrorKey` (`authInvalid`, `network`, `rateLimited`, `notFound`, `mappingIncomplete`, `pushFailed`, `pullFailed`, `conflict`, `permissionMissing`, `unknown`).

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
  listScopes() {
    /* адреса, доступные этим ключам: доски, проекты, пространства */
  }
  listContainers(scope) {
    /* колонки внутри выбранного scope */
  }
  listProjects(scope) {
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
  // Необязательный: свой шаг маппинга вместо общей таблицы (см. дескриптор
  // Vikunja). Правило для обоих UI-компонентов дескриптора: они получают всё
  // пропсами и **никогда не импортируют стор** — стор сам импортирует реестр
  // интеграций, и обратный импорт замкнул бы цикл
  // `store → registry → descriptor → компонент → store`. Стор читает слой
  // настроек (`TodoSettingsStepBody`) и передаёт шагу `MappingStepProps`.
  // MappingStep: MyMappingStep,
  create: (config) => new MyIntegration(config as MyServiceConfig),
  // Где внутри конфига лежит адрес — знает только дескриптор; отдельного
  // персистентного поля у scope нет.
  getScope: (config) => {
    const { spaceId } = config as MyServiceConfig
    return spaceId ? { spaceId } : null
  },
  // Чистая пара к getScope: копия конфига с записанным адресом.
  withScope: (config, scope) => ({
    ...(config as MyServiceConfig),
    spaceId: String(scope.spaceId),
  }),
  // Ваш ли это remoteRef: чужие стор не выбрасывает, а перепривязывает.
  ownsRef: (ref) => 'myServiceId' in ref,
  // Необязательный: подписка на изменения на бэкенде — вызывайте onEvent и
  // верните отписку. Есть только у Vikunja (service worker пуллит по
  // chrome.alarms и рассылает дельту); без канала push'а просто не реализуйте.
  // subscribeRemoteChanges: (scope, onEvent) => () => {},
  // Необязательный: перевыдать потерянное разрешение. Нужен только бэкенду,
  // чей хост лежит в optional_host_permissions (Vikunja): по кнопке баннера
  // «Выдать снова». Вызов chrome.permissions.request должен быть
  // синхронным — Chrome выдаёт optional-origin только внутри жеста
  // пользователя, — поэтому функция не `async` и возвращает промис самого
  // запроса.
  // recoverPermission: (config) => recoverMyPermission(config),
  // Необязательный: можно ли пушить задачи, созданные ДО подключения
  // интеграции (remoteRef === null, syncState === 'clean'). У Trello — true
  // (историческое поведение), у Vikunja — false, и отсутствие флага значит
  // false: автоматическая миграция в чужой трекер необратима (ADR §Р10).
  // Такие задачи остаются локальными, пока пользователь сам не нажмёт
  // «Импортировать» в summary.
  // autoImportLocalTasks: false,
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

В оба файла `src/i18n/resources/{en,ru}/widgets/todoWidget.json` добавьте namespace `integrations.<name>.*` с теми же ключами, что есть у Trello (`title`, `description`, `connect.*`, `board.*`, `mapping.*`, `summary.*`, `showcase.*`). Тексты ошибок общие для всех интеграций и лежат в `integrations.errors.*` — по одному ключу на `IntegrationErrorKey`, дублировать их в своём namespace не нужно. Контракт-тест `tests/contracts/i18nKeys.test.ts` падает, если EN и RU расходятся.

### Шаг 8. Ничего не подключайте руками

Диспетчера по имени интеграции больше нет: `TodoSettingsConnect.tsx` отдаёт конфиг как есть — `connectIntegration(integrationName, config)`. Стор сам находит дескриптор в реестре и валидирует кандидата той же zod-схемой, что охраняет `chrome.storage` (см. `store/schema.ts`), — невалидный конфиг не дойдёт ни до сети, ни до стора. Поэтому схема вашего конфига должна быть добавлена в union в `store/schema.ts`.

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
- [ ] Схема конфига добавлена в union `integrationSchema` в `store/schema.ts`
- [ ] `getScope` / `withScope` / `ownsRef` реализованы в дескрипторе
- [ ] Интеграция показывается в picker'е настроек после `yarn dev`
- [ ] Ручной smoke-тест: connect → board → mapping → создать таску → переместить в сервисе → sync now

## 🔐 Разрешения Chrome: что обязательно учитывать

В `manifest.config.ts` уже заявлены разрешения:

- `storage` — обязательно для синхронизации и сохранения сторов
- `tabs` — работа с вкладками (запрос, группировка, перемещение)
- `tabGroups` — управление группами вкладок Chrome
- `bookmarks` — доступ к закладкам (виджет ChromeLibrary)
- `alarms` — планировщик очистки неактивных табов
- `notifications` — уведомления при закрытии табов (cleanup ask mode)
- `idle` — определение простоя для трекинга активности

Хосты:

- `host_permissions: https://api.trello.com/*` — выдаётся при установке; интеграция Todo с Trello ходит на фиксированный адрес API, известный на этапе сборки.
- `optional_host_permissions: https://*/*` — **при установке не запрашивается ничего**. Vikunja разворачивается на своём сервере, его адрес на этапе сборки неизвестен, поэтому широкий паттерн объявлен как опциональный. Конкретный origin запрашивается в рантайме через `chrome.permissions.request` — только в момент, когда пользователь нажимает «Подключить» в форме Vikunja, и только для того хоста, который он сам ввёл. Wildcard-хосты (`https://*`, `https://%2A`, `https://*.example.com`) и IPv6-литералы отклоняются до запроса: иначе один такой адрес превратил бы запрос в доступ ко всем сайтам.

  Грант проверяется **на каждой операции**, а не один раз при подключении: `withVikunjaClient` в воркере вызывает `chrome.permissions.contains` перед любым сетевым вызовом, поэтому отзыв доступа в `chrome://settings` мгновенно останавливает синхронизацию. Match pattern в Chrome не может содержать порт, поэтому грант выдаётся **на хост целиком** и покрывает все его порты.

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
- `src/popup/` — extension popup (Tab Rules Engine).
- `src/background/` — background service worker (rule execution, cleanup).
- `src/store/` — Zustand stores.
- `src/services/chrome/` — `chrome.storage` integration and sync layer.
- `src/types/widgets.ts` — widget types and `widgetRegistry`.
- `src/widgets/*` — widget implementations (one folder per widget).

### Tab Rules Engine (popup)

The extension popup provides an automatic tab grouping, sorting, and cleanup engine.

**Key features:**

- **Grouping Rules** — group tabs by domain, regex, title, or path. Rules apply top-to-bottom (first match wins) with drag-and-drop reordering.
- **Sorting** — sort tabs (by domain, title, last access, URL) and groups (by name, tab count). Scope: Off / Window / Global (cross-window tab consolidation).
- **Cleanup** — auto-close inactive tabs (1d-28d threshold), with Ask (Chrome Notifications) and Auto modes.
- **Automation** — Realtime (on every tab event), Delayed (debounced), or Manual (Apply Now button).

**Architecture:**

- `src/popup/types/rules.ts` — types, constants, defaults
- `src/popup/services/` — pure pipeline functions (matchers, grouping, sorting, orchestrator)
- `src/popup/utils/filter.ts` — system/pinned tab filtering
- `src/popup/store/tabRules.ts` — Zustand store with `withChromeSync`
- `src/popup/components/` — popup React UI components
- `src/background/` — service worker: chromeAdapter, pipelineExecutor, eventListeners, messageHandler, cleanup (activityTracker, scheduler, notifications)

**Storage keys:** `tabRules:v1`, `tabRules:activity`

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

  listScopes(): Promise<IntegrationOutcome<RemoteScopeOption[]>>
  listContainers(scope: RemoteScope): Promise<IntegrationOutcome<RemoteContainer[]>>
  listProjects(scope: RemoteScope): Promise<IntegrationOutcome<Project[]>>

  pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>>
  pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>>

  /** Optional: create a container inside a scope (for a mapping step that builds missing columns). */
  createContainer?(scope: RemoteScope, title: string): Promise<IntegrationOutcome<RemoteContainer>>
}
```

`RemoteScope` is a `Record<string, string | number>` — an address for your task list that the store treats as opaque: `{ boardId }` for Trello, `{ projectId, viewId }` for Vikunja. `listScopes` returns `RemoteScopeOption[]` (`{ scope, name }`) for the picker step, `listContainers` returns `RemoteContainer[]` (`{ id, name, isTerminal? }`) — the columns/buckets inside a scope, where `isTerminal` marks the backend's own "done" column (Trello has none, so it never sets the flag). The chosen scope reaches the adapter as `PullContext.scope` / `PushContext.scope`.

`PullContext` is what the store knows about its tasks at pull time:

```ts
export interface PullContext {
  scope: RemoteScope
  mapping: StatusListMapping
  /** Existing remote refs, keyed by local task id. */
  knownRefs: Record<string, RemoteTaskRef>
  /** Current local status of each task, keyed by local task id. */
  knownStatuses: Record<string, TodoStatus>
}
```

`knownStatuses` only matters for backends that cannot store all five statuses remotely (Vikunja in flat mode knows `done` / not done and nothing else): the adapter keeps the local intermediate status instead of resetting the task to `input` on every pull. If your columns carry the status themselves, ignore the field — Trello does.

Every method returns `IntegrationOutcome<T>` — a discriminated union of `{ ok: true, value }` or `{ ok: false, errorKey, ref? }`. The optional `ref` on the failure branch is for pushes that take several requests: if the remote record was already created and a later request failed, return its `RemoteTaskRef` alongside the error — the store remembers it, so the next sync won't create a duplicate. Don't throw — your client should catch network failures and translate them to one of the `IntegrationErrorKey` literals (`authInvalid`, `network`, `rateLimited`, `notFound`, `mappingIncomplete`, `pushFailed`, `pullFailed`, `conflict`, `permissionMissing`, `unknown`).

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
  listScopes() {
    /* addresses these credentials can reach: boards, projects, spaces */
  }
  listContainers(scope) {
    /* columns inside the chosen scope */
  }
  listProjects(scope) {
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
  // Optional: your own mapping step instead of the generic table (see the
  // Vikunja descriptor). The rule for both of a descriptor's UI components:
  // they take everything as props and **never import the store** — the store
  // imports the integration registry, so importing it back would close the
  // loop `store → registry → descriptor → component → store`. The settings
  // layer (`TodoSettingsStepBody`) reads the store and hands the step its
  // `MappingStepProps`.
  // MappingStep: MyMappingStep,
  create: (config) => new MyIntegration(config as MyServiceConfig),
  // Only the descriptor knows where the address lives inside its config —
  // the scope is not a separate persisted field.
  getScope: (config) => {
    const { spaceId } = config as MyServiceConfig
    return spaceId ? { spaceId } : null
  },
  // Pure counterpart of getScope: a copy of the config with the scope written in.
  withScope: (config, scope) => ({
    ...(config as MyServiceConfig),
    spaceId: String(scope.spaceId),
  }),
  // Is this remoteRef yours? Foreign refs are re-linked, never dropped.
  ownsRef: (ref) => 'myServiceId' in ref,
  // Optional: watch the backend — call onEvent and return the unsubscribe.
  // Only Vikunja has it (its service worker pulls on chrome.alarms and
  // broadcasts the delta); leave it out when there is no push channel.
  // subscribeRemoteChanges: (scope, onEvent) => () => {},
  // Optional: re-request a permission the user withdrew. Only a backend whose
  // host lives in optional_host_permissions (Vikunja) needs it — it powers the
  // widget banner's "Grant again". The chrome.permissions.request call must be
  // synchronous, because Chrome grants an optional origin only from inside a
  // user gesture: hence a non-`async` function returning that call's promise.
  // recoverPermission: (config) => recoverMyPermission(config),
  // Optional: may a sync push tasks created BEFORE the integration existed
  // (remoteRef === null, syncState === 'clean')? Trello says true (its
  // long-standing behaviour), Vikunja says false — and an absent flag means
  // false: an automatic migration into someone's own tracker cannot be taken
  // back (ADR §Р10). Such tasks stay local until the user presses Import in
  // the settings summary.
  // autoImportLocalTasks: false,
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

Add an `integrations.<name>.*` namespace to both `src/i18n/resources/en/widgets/todoWidget.json` and `.../ru/widgets/todoWidget.json`, mirroring the Trello shape (`title`, `description`, `connect.*`, `board.*`, `mapping.*`, `summary.*`, `showcase.*`). Error texts are shared across integrations and live in `integrations.errors.*` — one key per `IntegrationErrorKey`, so don't duplicate them in your own namespace. The contract test `tests/contracts/i18nKeys.test.ts` fails on EN/RU drift.

### Step 8. Nothing to wire by hand

There is no per-integration dispatch any more: `TodoSettingsConnect.tsx` passes the config through as-is — `connectIntegration(integrationName, config)`. The store looks the descriptor up in the registry and validates the candidate with the very Zod schema that guards `chrome.storage` (see `store/schema.ts`), so an invalid config never reaches the network or the store. That does mean your config's schema has to join the union in `store/schema.ts`.

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
- [ ] The config schema joined the `integrationSchema` union in `store/schema.ts`
- [ ] `getScope` / `withScope` / `ownsRef` implemented on the descriptor
- [ ] Integration shows up in the settings picker after `yarn dev`
- [ ] Manual smoke test: connect → board → mapping → create a task → move it on the remote → sync now

## 🔐 Chrome permissions (must consider)

Current manifest permissions include:

- `storage` — required for synchronized persistence
- `tabs` — tab management (query, group, move)
- `tabGroups` — Chrome tab group management
- `bookmarks` — bookmarks access (ChromeLibrary widget)
- `alarms` — cleanup scheduler for inactive tabs
- `notifications` — cleanup ask-mode notifications
- `idle` — idle detection for activity tracking

Hosts:

- `host_permissions: https://api.trello.com/*` — granted at install time; the Trello Todo integration talks to one fixed API address that is known at build time.
- `optional_host_permissions: https://*/*` — **nothing is requested at install**. Vikunja is self-hosted and its address is unknown at build time, so the broad pattern is declared as optional only. The concrete origin is requested at runtime via `chrome.permissions.request`, exclusively when the user submits the Vikunja connect form, and exclusively for the host they typed. Wildcard hosts (`https://*`, `https://%2A`, `https://*.example.com`) and IPv6 literals are rejected before the request — one of those would otherwise turn it into access to every site.

  The grant is re-checked **on every operation**, not once at connect time: `withVikunjaClient` in the service worker calls `chrome.permissions.contains` before any network call, so revoking the host in `chrome://settings` stops syncing immediately. A Chrome match pattern cannot carry a port, so the grant is **per host** and covers all of its ports.

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
