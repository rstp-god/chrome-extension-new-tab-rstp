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
- [🔗 Vikunja: подключение и синхронизация](#-vikunja-подключение-и-синхронизация)
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
- Playwright-спеки Todo-виджета и Vikunja:
  - `src/widgets/Todo/test/TodoWidget.scenario.spec.ts` — базовые сценарии виджета;
  - `src/widgets/Todo/test/TodoVikunja.scenario.spec.ts` — сценарии Vikunja: форма подключения и запрос разрешения, мастер маппинга, плоский режим, баннер отозванного разрешения, импорт локальных задач. Часть проверок — скриншотные, baseline лежат в `src/widgets/Todo/test/chromium-mac/TodoVikunja/`; **папки `chromium-ci` для них ещё нет** — снять её можно только workflow `Update Visual Snapshots` (или `yarn test:extension:update-snapshots:ci` на Linux), никогда не с macOS.
  - `tests/extension/vikunjaBridge.spec.ts` — мост «страница ↔ service worker»: доставка сообщения, ping на холодном старте воркера, постановка и снятие alarm'а фонового пулла по сохранённому конфигу. Скриншотов нет, baseline не нужны.
- Обе спеки попадают в `yarn test:extension:local` / `:ci` — они уже покрыты путями `tests/extension src/widgets` в скриптах.
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

## 🔗 Vikunja: подключение и синхронизация

Todo-виджет умеет двусторонне синхронизироваться с [Vikunja](https://vikunja.io/) на вашем сервере. Проверено на Vikunja 2.6; на других версиях поведение может отличаться.

### Подключение

1. Настройки Todo-виджета → **Vikunja**.
2. **Адрес инстанса** — только `https` и только литеральный хост (например `https://tasks.example.com`; sub-path вида `https://host/vikunja` тоже подойдёт). `http`, wildcard-хосты и IPv6-литералы форма отклоняет.
3. **API-токен** — в Vikunja: «Настройки» → «API-токены». Токену нужны скоупы `tasks` и `projects.read_all`; чтобы мастер маппинга мог достроить колонки — ещё `projects.views_buckets_put` и `views_buckets_delete` (без них шаг «создать недостающие колонки» ответит 403).
4. По кнопке «Подключить» **Chrome спросит разрешение на этот хост**. Если отказать — ничего не сохранится: нажмите «Подключить» ещё раз и примите запрос.

### Проект и вью

Дальше выбирается проект — виджет синхронизируется с его **канбан-вью**. Проекты без канбан-вью в списке не показываются. Сменить проект можно позже в сводке настроек («Сменить проект»).

### Мастер маппинга

Бакеты канбан-вью сопоставляются пяти статусам виджета (`Входящее`, `В работе`, `Затыки`, `Готово`, `Удалено`):

- бакеты **предварительно сопоставляются по названиям** — строки остаётся проверить и поправить;
- один статус может собирать задачи из нескольких бакетов; первый в строке — тот, куда уходят новые задачи;
- чего в проекте нет, мастер предлагает **создать** — «Затык» и «Корзина»;
- done-бакет Vikunja может означать только «Готово»: задача, попавшая туда, закрывается на сервере, поэтому назначить его другому статусу нельзя.

### Плоский режим

Если маппинг пропустить («Пропустить — плоский режим»), в Vikunja уходит только «Готово», а «В работе» / «Затыки» / «Удалено» остаются видны **только внутри расширения** и живут в локальном сторе виджета. В сводке настроек такой проект помечен «Только внутри расширения», а таблица маппинга не показывается — в плоском режиме она описывала бы то, чего не происходит. Сохранить строки маппинга поверх плоского режима можно в любой момент — проект перейдёт на полную синхронизацию по бакетам.

### Фоновая синхронизация

Service worker пуллит по `chrome.alarms` с периодом **1, 5 или 15 минут** (по умолчанию 5; переключается в сводке настроек, пункт «Фоновая синхронизация»). Изменения, сделанные в Vikunja, попадают в открытую вкладку в пределах этого интервала. Кнопка «Sync now» в футере виджета читает инстанс немедленно.

Alarm один на подключение, а не на доску: за один тик воркер читает **каждую размеченную доску** по очереди и в конце шлёт открытым вкладкам один броадкаст, а не по одному на доску. Поэтому период означает то, что написано, и не делится между досками.

Если у какой-то доски **не закончен мастер маппинга**, фоновая синхронизация приостанавливается целиком — не только для этой доски. Класть пулл некуда: без маппинга бакетов задачи доски некуда разложить, а страница в таком состоянии всё равно держит пользователя на шаге маппинга. Как только мастер закончен, пулл возобновляется сам — сохранение конфига и есть то событие, которое пересобирает alarm.

### Конфликты

Если задачу изменили в Vikunja, пока её правили локально, **побеждает версия с сервера**, а на карточке появляется бейдж «Изменено в Vikunja — ваша правка откачена». Конфликт всегда про одну задачу: остальные в этой синхронизации проходят нормально.

### Импорт локальных задач

Задачи, созданные **до** подключения интеграции, сами в Vikunja не уезжают: автоматическая миграция в чужой трекер необратима, а подключение своего трекера — это просьба видеть _его_ задачи в виджете, а не наоборот. Такие задачи остаются локальными и несвязанными, пока в сводке настроек не нажать «Импортировать N задач в &lt;проект&gt;» — только после этого они будут созданы на следующей синхронизации.

### Что где хранится

| Что                                                   | Где                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Адрес инстанса и API-токен                            | `chrome.storage.local` **на этом устройстве**, внутри envelope `todo-widget:v1`. Никогда не в `chrome.storage.sync`: подключённый Todo-стор целиком переезжает на `local` (`area: (s) => (s.integration ? 'local' : 'sync')`), поэтому на другие ваши Chrome токен не уедет. |
| Задачи виджета                                        | тот же envelope `todo-widget:v1`.                                                                                                                                                                                                                                            |
| Снапшот вью для фонового пулла                        | `chrome.storage.local`, ключ `vikunja:snapshot:<projectId>:<viewId>` (обрезается по числу задач и байтовому бюджету).                                                                                                                                                        |
| Копия списка перед «Отключить» / «Сменить интеграцию» | `chrome.storage.local`, ключ `todo-widget:handover:v1` — задачи плюс имена интеграции и проекта, **без конфига и токена**; удаляется при первой загрузке стора спустя 30 дней.                                                                                               |

Токен уходит **только** на тот инстанс, адрес которого вы ввели, и только в заголовке `Authorization`. Расширение не отправляет ваши данные никуда больше.

### Оговорка про описания задач

Виджет хранит описание задачи как **plain text**: HTML из Vikunja разворачивается в текст при пулле. Обратное преобразование — простые абзацы `<p>` с `<br>` вместо одиночных переводов строки. Отсюда два следствия:

- описание **существующей** задачи Vikunja виджет не перезаписывает — повторная синхронизация (`resync`) шлёт только статус, поэтому форматирование, набранное в веб-редакторе, остаётся на месте;
- а вот всё, что виджет **сам отправляет** в описание (задача, созданная из виджета, и будущий UI правки заголовка/описания), уезжает простыми абзацами — богатое форматирование так не сохранить.

По той же причине у Vikunja-интеграции **нет скрытых метаданных**: веб-редактор Vikunja (TipTap) выбрасывает HTML-комментарии при сохранении описания (проверено на инстансе 2.6.0), поэтому локальный id выводится детерминированно из `vikunja:<task.id>`, а не прячется в тексте задачи.

## 🔌 Свой интегратор для Todo-виджета

Todo-виджет умеет синхронизироваться с внешними сервисами через модульную систему интеграций. В коробке поставляется один интегратор — Trello (`src/widgets/Todo/integrations/trello/`), а добавление нового сводится к написанию одной папки.

### Принципы

- Каждая интеграция живёт в `src/widgets/Todo/integrations/<name>/` и **знает про сущности Todo** (`TodoTask`, `TodoStatus`, `Project`). Это не generic-абстракция — вы пишете адаптер именно под Todo-виджет.
- Реестр строится автоматически через `import.meta.glob('./*/index.ts', { eager: true })` в `src/widgets/Todo/integrations/index.ts`. Достаточно положить новую папку и экспортнуть `descriptor` — она появится в picker'е настроек.
- Активная интеграция в каждый момент времени **одна**. Конфиг хранится в Zustand-сторе под ключом `todo-widget:v1` через тот же `withChromeSync` envelope, что и сами тудушки. Область хранения у Todo-стора динамическая — `area: (s) => (s.integration ? 'local' : 'sync')`: пока интеграции нет, список задач ездит через `chrome.storage.sync`, а подключение переводит весь envelope в `chrome.storage.local`, чтобы адрес инстанса и токен не уезжали на другие устройства.
- Рядом лежит **handover-снапшот** — ключ `todo-widget:handover:v1` в `chrome.storage.local`. Виджет пишет его перед «Отключить» и «Сменить интеграцию»: только задачи плюс имя интеграции и доски/проекта, **никогда конфиг и токен** (zod-схема `todoHandoverSnapshot` не описывает эти поля, а `z.object` отбрасывает всё лишнее). Снапшот перезаписывается при каждом отключении, обрезается по хвосту до 1,5 МБ (тогда в нём стоит `truncated: true`) и удаляется при первой загрузке store'а спустя 30 дней. Достать его вручную можно из DevTools страницы расширения: `await chrome.storage.local.get('todo-widget:handover:v1')`.
- Кнопка «Sync now» есть в футере виджета; кроме неё пулл происходит при монтировании виджета, при действиях пользователя и — у бэкендов с фоновым каналом — по `chrome.alarms` из service worker'а (см. «Транспорты» ниже).

### Транспорты: прямой `fetch` или мост через service worker

Первое решение новой интеграции — не архитектурное, а фактическое. Вопрос один: **отвечает ли API на preflight с `Origin: chrome-extension://…` заголовком `Access-Control-Allow-Origin`?**

- **Да → прямой `fetch` со страницы новой вкладки.** Так работает Trello: его API отдаёт CORS-заголовки для extension-origin. Адаптер — обычный HTTP-клиент в `integrations/<name>/client.ts`, кода в воркере не нужно вообще, хост объявлен в `host_permissions` манифеста. Это самый простой путь, выбирайте его, если можете.
- **Нет → мост через service worker, и хост придётся запрашивать в рантайме.** Так работает Vikunja: на `OPTIONS` с extension-origin инстанс отвечает `204` вообще без единого `Access-Control-*` (проверено curl-пробой), поэтому со страницы к нему не постучаться. Фоновые запросы из воркера под host-permission под CORS не попадают — отсюда лишний хоп через сообщения.

Проверить можно одной командой: `curl -i -X OPTIONS -H 'Origin: chrome-extension://aaaa' https://<host>/api/v1/info`.

Как устроен мост Vikunja — что где лежит:

| Модуль                                               | Роль                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integrations/vikunja/bridge.ts`                     | Адаптер не делает `fetch`: отправляет `chrome.runtime.sendMessage({ type: 'vikunja', op, cfg, … })` и валидирует ответ через Zod.                                                                                               |
| `background/vikunja/messages.ts`                     | Общий словарь моста: имена операций, wire-типы, ключи ошибок, `normalizeVikunjaBaseUrl` / `vikunjaHostPattern`, формы броадкастов, набор периодов пулла.                                                                        |
| `background/vikunja/gate.ts`                         | `withVikunjaClient`: повторно валидирует конфиг, выводит match pattern хоста, проверяет грант через `chrome.permissions.contains` и только тогда отдаёт готовый клиент.                                                         |
| `background/vikunja/handlers.ts`                     | Разбор операции и диспетчеризация.                                                                                                                                                                                              |
| `background/vikunja/client.ts`                       | **Единственный `fetch` к Vikunja во всём проекте.** Токен уходит только в заголовке `Authorization`, плюс `redirect: 'error'` (редирект унёс бы токен на неодобренный хост), `credentials: 'omit'`, `cache: 'no-store'`.        |
| `background/vikunja/alarm.ts`, `pull.ts`, `cache.ts` | Фоновый пулл по `chrome.alarms` (`vikunja-pull`, период 1 / 5 / 15 мин, по умолчанию 5), снапшот вью в `chrome.storage.local` под `vikunja:snapshot:<projectId>:<viewId>`, броадкасты `vikunja/pulled` и `vikunja/pull-failed`. |
| `integrations/vikunja/subscribe.ts`                  | `descriptor.subscribeRemoteChanges`: виджет слушает броадкаст и отвечает тихой синхронизацией. `PullContext.force` отличает пулл, который надо сделать по-настоящему, от того, который можно ответить из снапшота.              |

Ещё два правила, которые легко нарушить:

- **Слушатели воркера (`chrome.runtime.onMessage`, `chrome.alarms.onAlarm`) регистрируются синхронно на верхнем уровне модуля** (`setupVikunjaBridge` / `setupVikunjaPull` в `src/background/index.ts`). MV3 доставляет событие, разбудившее воркер, сразу после вычисления скрипта — слушатель, привешенный за `await`, пропустит именно тот alarm, который его и запустил.
- **Правило границы:** `src/background/<name>/messages.ts` — единственный модуль, которому разрешено пересекать границу «воркер ↔ виджет». Ничто из `src/background/vikunja/**` не импортирует `src/widgets/**`, а интеграция импортирует из `src/background/` только этот файл. Проверяется контракт-тестом `tests/contracts/vikunjaBoundary.test.ts`.

Конфиг при этом валидируется дважды: на странице — ради UX, в воркере — потому что страница для воркера недоверенная сторона. Все проверенные факты об API Vikunja (формы ответов, ловушки, результат CORS-пробы, поведение веб-редактора) зафиксированы в комментариях `src/background/vikunja/schema.ts` и закреплены тестами `src/background/vikunja/test/schema.test.ts` — сверяйтесь с ними, а не с догадками.

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
  /** Ответ `getScope` как есть: `null`, если scope'а нет или он не один. */
  scope: RemoteScope | null
  /** Mapping со слайса; `null` у бэкенда, который держит его на своём scope. */
  mapping: StatusListMapping | null
  /** Уже известные remoteRef, ключ — локальный id задачи. */
  knownRefs: Record<string, RemoteTaskRef>
  /** Текущий локальный статус каждой задачи, ключ — локальный id. */
  knownStatuses: Record<string, TodoStatus>
  /** Читать бэкенд по-настоящему, а не отвечать из кеша адаптера/воркера. */
  force?: boolean
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
  // Необязательный: свой шаг выбора scope вместо общего пикера — нужен
  // бэкенду, у которого scope не один (`ScopeStepProps`, те же правила).
  // ScopeStep: MyScopeStep,
  // Необязательный: на каком шаге настроек стоит подключение
  // ('board' | 'mapping' | 'summary'). Отсутствие = обычное правило: нет
  // scope → 'board', нет mapping → 'mapping', иначе 'summary'. Нужен тому, у
  // кого scope'ов список: Vikunja отвечает 'mapping', пока не размечена
  // ЛЮБАЯ из досок. Этот же хук отвечает на «можно ли синхронизировать»:
  // 'summary' — да, остальное — нет (`isReadyToSync` в integrations/setup.ts).
  // getSetupStep: (integration) => 'summary',
  // Необязательный: что бэкенд требует от проекта задачи. Отсутствие = ответ
  // Trello: проект необязателен, меняется, дефолта нет. Vikunja: required
  // (задача живёт В проекте), defaultId — дефолтная доска, changeable: false.
  // projectPolicy: { required: true, defaultId: (config) => '1', changeable: false },
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
  // Получает весь слайс, а не один scope: какие адреса слушать — это чтение
  // собственного конфига (Vikunja принимает броадкаст о любой из config.boards).
  // subscribeRemoteChanges: (integration, onEvent) => () => {},
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
  // Необязательный: свой блок в сводке настроек — то, чего общая сводка про
  // ваш бэкенд знать не может (у Vikunja это период фонового пулла и
  // предупреждение про плоский режим). Как и MappingStep, получает всё
  // пропсами (`SummaryExtrasProps`) и не импортирует стор.
  // SummaryExtras: MyServiceSummaryExtras,
  // Необязательный: хост инстанса из конфига — его называет баннер «Выдать
  // снова». Нужен тем, чей адрес вводит пользователь; у Trello адрес
  // зафиксирован в манифесте, поэтому хука нет.
  // describeHost: (config) => urlHost((config as MyServiceConfig).baseUrl, null),
  // Необязательный: стоит ли показывать таблицу «статус → колонка». По
  // умолчанию да; Vikunja отвечает false в плоском режиме, где маппинг —
  // заглушка на дефолтный бакет.
  // showsStatusMapping: (config) => (config as MyServiceConfig).kanban === true,
  // Необязательный: сколько push'ей одной синхронизации стор держит в
  // полёте одновременно. Отсутствие или 1 — привычная последовательная
  // фаза push'а. Поднимать можно только если бэкенд (или транспорт
  // адаптера) гарантирует, что два push'а не переплетутся в одну запись:
  // Vikunja поднимает, потому что воркер сериализует по task id, Trello
  // оставляет по умолчанию. Первый упавший push всё равно завершает фазу.
  // pushConcurrency: 4,
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

  Грант проверяется **на каждой операции**, а не один раз при подключении: `withVikunjaClient` в воркере вызывает `chrome.permissions.contains` перед любым сетевым вызовом. Match pattern в Chrome не может содержать порт, поэтому грант выдаётся **на хост целиком** и покрывает все его порты.

  Если отозвать доступ в `chrome://extensions` → «Подробнее» → «Доступ к сайтам», синхронизация останавливается немедленно (все операции возвращают `permissionMissing`), а виджет показывает баннер «У расширения отозвано разрешение на `<хост>`» с кнопкой **«Выдать снова»** — она вызывает `descriptor.recoverPermission`, то есть тот же `chrome.permissions.request` внутри вашего клика. Ничего в фоне переспросить нельзя: Chrome выдаёт optional-origin только внутри жеста пользователя, поэтому воркер умеет проверять грант, но не просить его.

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
- [🔗 Vikunja](#-vikunja-connecting-and-syncing)
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
- Todo widget and Vikunja Playwright specs:
  - `src/widgets/Todo/test/TodoWidget.scenario.spec.ts` — the widget's base scenarios;
  - `src/widgets/Todo/test/TodoVikunja.scenario.spec.ts` — Vikunja scenarios: the connect form and its permission request, the mapping wizard, flat mode, the revoked-permission banner, importing local tasks. Some assertions are screenshots; their baselines live in `src/widgets/Todo/test/chromium-mac/TodoVikunja/`, and **there is no `chromium-ci` folder for them yet** — it can only be produced by the `Update Visual Snapshots` workflow (or `yarn test:extension:update-snapshots:ci` on Linux), never from a Mac.
  - `tests/extension/vikunjaBridge.spec.ts` — the page ↔ service worker bridge: message delivery, a ping that cold-starts the worker, and scheduling/clearing the background-pull alarm from the stored config. No screenshots, so no baselines.
- Both specs are already covered by `yarn test:extension:local` / `:ci` — the scripts point Playwright at `tests/extension src/widgets`.
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

## 🔗 Vikunja: connecting and syncing

The Todo widget can sync two-way with a self-hosted [Vikunja](https://vikunja.io/). Tested against Vikunja 2.6; other versions may behave differently.

### Connecting

1. Todo widget settings → **Vikunja**.
2. **Instance URL** — `https` only, and a literal host only (e.g. `https://tasks.example.com`; a sub-path install such as `https://host/vikunja` is fine too). `http`, wildcard hosts and IPv6 literals are rejected by the form.
3. **API token** — in Vikunja: Settings → API tokens. The token needs the `tasks` and `projects.read_all` scopes; for the mapping wizard to build missing columns it also needs `projects.views_buckets_put` and `views_buckets_delete` (without them the "create missing columns" step answers 403).
4. Pressing "Connect" makes **Chrome ask for permission for that host**. Decline and nothing is saved: press Connect again and accept the prompt.

### Project and view

Next you pick a project — the widget syncs with its **kanban view**. Projects without a kanban view are not listed. You can change it later from the settings summary ("Change project").

### The mapping wizard

The kanban view's buckets are mapped onto the widget's five statuses (`Input`, `In progress`, `Struggle`, `Completed`, `Deleted`):

- buckets are **pre-matched by name** — check the rows and fix anything that looks off;
- one status can pull from several buckets; the first one in a row is where new tasks land;
- whatever the project lacks, the wizard offers to **create** — `Struggle` and `Trash`;
- Vikunja's done bucket can only mean `Completed`: a task moved there is marked done server-side, so it cannot be assigned to another status.

### Flat mode

Skip the mapping ("Skip — flat mode") and only `Completed` syncs to Vikunja, while `In progress` / `Struggle` / `Deleted` remain visible **inside the extension only**, living in the widget's local store. The settings summary marks such a project "Only inside the extension" and hides the mapping table — in flat mode it would describe something that does not happen. Saving mapping rows over flat mode switches the project to full bucket sync at any time.

### Background sync

The service worker pulls on a `chrome.alarms` schedule every **1, 5 or 15 minutes** (default 5; switch it in the settings summary under "Background sync"). Changes made in Vikunja reach an open tab within that interval. The widget footer's "Sync now" reads the instance immediately.

There is one alarm per connection, not per board: a single tick reads **every mapped board** in turn and then sends the open tabs one broadcast rather than one per board. The period therefore means what it says and is not divided between the boards.

If any board's **mapping wizard is unfinished**, background sync pauses entirely — not just for that board. There is nowhere to put what a pull would return: without a bucket mapping that board's tasks cannot be placed, and the page keeps the user on the mapping step in that state anyway. Finishing the wizard resumes it on its own — saving the config is the very event that reconciles the alarm.

### Conflicts

If a task changed in Vikunja while it was being edited locally, **the remote version wins** and the card gets a badge: "Changed in Vikunja — your edit was rolled back". A conflict is always about one task; the rest of that sync goes through normally.

### Importing local tasks

Tasks created **before** the integration was connected are not pushed on their own: an automatic migration into someone's own tracker cannot be taken back, and connecting your tracker is a request to see _its_ tasks in the widget, not the other way round. Such tasks stay local and unlinked until you press "Import N local tasks into &lt;project&gt;" in the settings summary — only then are they created on the next sync.

### What is stored where

| What                            | Where                                                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance URL and API token      | `chrome.storage.local`, **on this device**, inside the `todo-widget:v1` envelope. Never `chrome.storage.sync`: a connected Todo store moves wholesale to `local` (`area: (s) => (s.integration ? 'local' : 'sync')`), so the token does not travel to your other Chrome profiles. |
| The widget's tasks              | the same `todo-widget:v1` envelope.                                                                                                                                                                                                                                               |
| Background-pull view snapshot   | `chrome.storage.local`, key `vikunja:snapshot:<projectId>:<viewId>` (capped by task count and by a byte budget).                                                                                                                                                                  |
| Pre-disconnect copy of the list | `chrome.storage.local`, key `todo-widget:handover:v1` — the tasks plus the integration and project names, **never the config or the token**; removed on the first store init after 30 days.                                                                                       |

The token is sent **only** to the instance whose address you typed, and only in the `Authorization` header. The extension sends your data nowhere else.

### Caveat: task descriptions

The widget stores a description as **plain text**: Vikunja's HTML is flattened to text on pull. The inverse is plain `<p>` paragraphs, with `<br>` for single newlines. Two consequences:

- the widget never rewrites the description of an **existing** Vikunja task — a retry (`resync`) sends only the status, so formatting typed in the web editor stays where it is;
- but whatever the widget **does send** as a description (a task created from the widget, and the future title/description editing UI) goes out as plain paragraphs — rich formatting cannot survive that round trip.

For the same reason the Vikunja integration keeps **no hidden metadata**: Vikunja's web editor (TipTap) strips HTML comments when a description is saved (verified against a 2.6.0 instance), so the local id is derived deterministically from `vikunja:<task.id>` rather than hidden in the task's text.

## 🔌 Writing your own Todo integration

The Todo widget can sync with external services through a modular integration system. Trello (`src/widgets/Todo/integrations/trello/`) ships in the box; adding a new backend is a one-folder drop-in.

### Principles

- Each integration lives under `src/widgets/Todo/integrations/<name>/` and **knows about Todo entities** (`TodoTask`, `TodoStatus`, `Project`). It is not a generic abstraction — you write an adapter specifically for the Todo widget.
- The registry is built automatically via `import.meta.glob('./*/index.ts', { eager: true })` in `src/widgets/Todo/integrations/index.ts`. Drop a folder, export `descriptor`, and it appears in the settings picker.
- At any moment **one** integration is active. Its config is persisted in the Zustand store under `todo-widget:v1` using the same `withChromeSync` envelope as the todos themselves. The Todo store's storage area is dynamic — `area: (s) => (s.integration ? 'local' : 'sync')`: with no integration the task list roams through `chrome.storage.sync`, and connecting one moves the whole envelope to `chrome.storage.local` so an instance URL and a token never leave the device.
- Next to it lives a **handover snapshot** under `todo-widget:handover:v1` in `chrome.storage.local`. The widget writes it right before "Disconnect" and "Switch integration": the tasks plus the integration and board/project names, and **never the config or the token** (the `todoHandoverSnapshot` zod schema does not declare those fields, and `z.object` strips whatever it does not declare). It is overwritten on every disconnect, trimmed from the tail to 1.5 MB (then it carries `truncated: true`), and removed on the first store init after 30 days. To recover it by hand, open DevTools on an extension page: `await chrome.storage.local.get('todo-widget:handover:v1')`.
- A "Sync now" button lives in the widget footer; beyond it a pull happens on widget mount, on user actions, and — for backends with a background channel — on a `chrome.alarms` schedule inside the service worker (see "Transports" below).

### Transports: direct `fetch` or the service worker bridge

A new integration's first decision is not architectural, it is factual. One question: **does the API answer a preflight from `Origin: chrome-extension://…` with `Access-Control-Allow-Origin`?**

- **Yes → direct `fetch` from the New Tab page.** That is Trello: its API sends CORS headers for extension origins. The adapter is an ordinary HTTP client in `integrations/<name>/client.ts`, no worker code is involved at all, and the host is declared in the manifest's `host_permissions`. This is the simplest path — take it when you can.
- **No → the service worker bridge, and the host has to be granted at runtime.** That is Vikunja: an `OPTIONS` from an extension origin comes back `204` with not a single `Access-Control-*` header (verified with a curl probe), so the page cannot reach it. Background fetches made from the worker under a host permission are not subject to CORS — hence the extra message hop.

One command settles it: `curl -i -X OPTIONS -H 'Origin: chrome-extension://aaaa' https://<host>/api/v1/info`.

How the Vikunja bridge is laid out:

| Module                                               | Role                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integrations/vikunja/bridge.ts`                     | The adapter never calls `fetch`: it sends `chrome.runtime.sendMessage({ type: 'vikunja', op, cfg, … })` and validates the reply with Zod.                                                                                                                         |
| `background/vikunja/messages.ts`                     | The bridge's shared vocabulary: op names, wire types, error keys, `normalizeVikunjaBaseUrl` / `vikunjaHostPattern`, broadcast shapes, the set of pull periods.                                                                                                    |
| `background/vikunja/gate.ts`                         | `withVikunjaClient`: re-validates the config, derives the host match pattern, confirms the grant with `chrome.permissions.contains`, and only then hands over a ready client.                                                                                     |
| `background/vikunja/handlers.ts`                     | Payload validation and op dispatch.                                                                                                                                                                                                                               |
| `background/vikunja/client.ts`                       | **The only `fetch` to a Vikunja instance in the whole project.** The token travels in the `Authorization` header only, plus `redirect: 'error'` (a redirect would carry the token to a host the user never approved), `credentials: 'omit'`, `cache: 'no-store'`. |
| `background/vikunja/alarm.ts`, `pull.ts`, `cache.ts` | Background pull on `chrome.alarms` (`vikunja-pull`, period 1 / 5 / 15 min, default 5), the view snapshot in `chrome.storage.local` under `vikunja:snapshot:<projectId>:<viewId>`, and the `vikunja/pulled` / `vikunja/pull-failed` broadcasts.                    |
| `integrations/vikunja/subscribe.ts`                  | `descriptor.subscribeRemoteChanges`: the widget listens for the broadcast and answers with a silent sync. `PullContext.force` separates a pull that must really hit the backend from one that may be answered out of the snapshot.                                |

Two more rules that are easy to break:

- **The worker's listeners (`chrome.runtime.onMessage`, `chrome.alarms.onAlarm`) are registered synchronously at module top level** (`setupVikunjaBridge` / `setupVikunjaPull` in `src/background/index.ts`). MV3 dispatches the event that woke a cold worker as soon as the script finishes evaluating, so a listener attached behind an `await` misses the very alarm that started it.
- **Boundary rule:** `src/background/<name>/messages.ts` is the only module allowed to cross the worker ↔ widget boundary. Nothing under `src/background/vikunja/**` imports `src/widgets/**`, and the integration imports from `src/background/` through that file alone. `tests/contracts/vikunjaBoundary.test.ts` enforces it.

The config is therefore validated twice: on the page for the sake of UX, in the worker because the page is the untrusted side of the bridge. Every verified fact about Vikunja's API — response shapes, the traps, the CORS probe, the web editor's behaviour — is captured in the comments of `src/background/vikunja/schema.ts` and pinned by `src/background/vikunja/test/schema.test.ts`; check those instead of guessing.

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
  /** What `getScope` answered: `null` when there is none, or not just one. */
  scope: RemoteScope | null
  /** The slice's mapping; `null` for a backend that keeps one per scope. */
  mapping: StatusListMapping | null
  /** Existing remote refs, keyed by local task id. */
  knownRefs: Record<string, RemoteTaskRef>
  /** Current local status of each task, keyed by local task id. */
  knownStatuses: Record<string, TodoStatus>
  /** Read the backend for real instead of answering from an adapter/worker cache. */
  force?: boolean
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
  // Optional: your own scope step instead of the generic picker — for a
  // backend whose scope is not a single one (`ScopeStepProps`, same rules).
  // ScopeStep: MyScopeStep,
  // Optional: which settings step this connection is on ('board' | 'mapping'
  // | 'summary'). Absent means the usual rule: no scope → 'board', no mapping
  // → 'mapping', otherwise 'summary'. For a backend with a *list* of scopes:
  // Vikunja answers 'mapping' while ANY of its boards is unmapped. The same
  // hook answers "may a sync run": 'summary' means yes and nothing else does
  // (`isReadyToSync` in integrations/setup.ts).
  // getSetupStep: (integration) => 'summary',
  // Optional: what the backend expects of a task's project. Absent means
  // Trello's answer: optional, changeable, no default. Vikunja: required (a
  // task lives *in* a project), defaultId is the default board, not changeable.
  // projectPolicy: { required: true, defaultId: (config) => '1', changeable: false },
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
  // It takes the whole slice rather than one scope: which addresses are worth
  // listening to is a reading of your own config (Vikunja accepts a broadcast
  // about any of `config.boards`).
  // subscribeRemoteChanges: (integration, onEvent) => () => {},
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
  // Optional: your own block in the settings summary — whatever the shared
  // summary cannot know about your backend (Vikunja puts its background-pull
  // period and its flat-mode caveat there). Prop-driven like MappingStep
  // (`SummaryExtrasProps`); it never imports the store.
  // SummaryExtras: MyServiceSummaryExtras,
  // Optional: the instance host from the config — what the "Grant again"
  // banner names. For backends addressed by an address the user typed;
  // Trello's is fixed in the manifest, so it has no hook.
  // describeHost: (config) => urlHost((config as MyServiceConfig).baseUrl, null),
  // Optional: is the "status → container" table worth showing? Yes by
  // default; Vikunja answers false in flat mode, where the mapping is a
  // placeholder pointing at the default bucket.
  // showsStatusMapping: (config) => (config as MyServiceConfig).kanban === true,
  // Optional: how many of a sync's pushes the store may have in flight at
  // once. Absent or 1 is the sequential push phase every backend gets by
  // default. Raise it only when the backend (or your transport) guarantees
  // two pushes cannot interleave into the same record: Vikunja raises it
  // because the worker's mutation queue serialises per task id (and per
  // project for creates), Trello leaves it unset. Either way, the first
  // failing push still ends the phase.
  // pushConcurrency: 4,
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

  The grant is re-checked **on every operation**, not once at connect time: `withVikunjaClient` in the service worker calls `chrome.permissions.contains` before any network call. A Chrome match pattern cannot carry a port, so the grant is **per host** and covers all of its ports.

  Revoke it in `chrome://extensions` → Details → Site access and syncing stops immediately (every operation answers `permissionMissing`), while the widget shows a banner — "The extension lost permission for `<host>`" — with a **"Grant again"** button that calls `descriptor.recoverPermission`, i.e. the same `chrome.permissions.request` from inside your click. Nothing can re-ask in the background: Chrome grants an optional origin only from inside a user gesture, so the worker may check a grant but never request one.

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
