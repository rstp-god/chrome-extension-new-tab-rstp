# RSTP New Tab Chrome Extension

Расширение заменяет стандартную вкладку Chrome на кастомную страницу с настраиваемыми виджетами, фоном и настройками интерфейса.

## Технологии проекта

- React + TypeScript
- Vite + CRXJS (`@crxjs/vite-plugin`) для сборки расширения
- Zustand для состояния
- `chrome.storage.local` для синхронизации данных между контекстами расширения

## Быстрый старт

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

## Архитектура (для стороннего разработчика)

### Где что находится

- `manifest.config.ts` — манифест расширения и разрешения Chrome.
- `src/newtab/` — UI новой вкладки.
- `src/store/` — Zustand-сторы приложения.
- `src/services/chrome/` — работа с `chrome.storage` и синхронизация.
- `src/types/widgets.ts` — типы виджетов и `widgetRegistry`.
- `src/widgets/*` — сами виджеты (по папке на виджет).

### Как работает `widget registry`

Реестр виджетов строится автоматически через:

```ts
import.meta.glob("../widgets/*/index.ts", { eager: true })
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

## Как работает синхронизация с Chrome

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

## Полный гайд: как сделать свой виджет

Ниже — минимальный рабочий путь для стороннего разработчика.

### Шаг 1. Создайте папку виджета

Пример:

```text
src/widgets/Weather/
```

### Шаг 2. Реализуйте React-компонент

`src/widgets/Weather/WeatherWidget.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';

export function WeatherWidget() {
  const [city, setCity] = useState('');

  const openSearch = () => {
    const q = city.trim();
    if (!q) return;

    const url = `https://www.google.com/search?q=${encodeURIComponent(`weather ${q}`)}`;
    chrome.tabs?.create?.({ url }) ?? window.open(url, '_blank');
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="Введите город"
      />
      <Button onClick={openSearch}>Погода</Button>
    </div>
  );
}
```

### Шаг 3. Добавьте `index.ts` с `meta` и `Component`

`src/widgets/Weather/index.ts`:

```ts
import { WidgetMeta } from '@/types/widgets.ts';
import { WeatherWidget } from './WeatherWidget.tsx';

export const meta = {
  widgetType: 'weather',
  title: 'Погода',
  description: 'Быстрый поиск прогноза',
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta;

export const Component = WeatherWidget;
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

Это даст восстановление данных после перезапуска браузера/расширения.

## Разрешения Chrome: что обязательно учитывать

В `manifest.config.ts` уже заявлены разрешения:

- `storage` — обязательно для синхронизации и сохранения сторов
- `tabs` — нужно для открытия новых вкладок (`chrome.tabs.create`)
- `sidePanel`, `contentSettings` — используются инфраструктурой проекта

### Правила для разработки новых виджетов

1. **Принцип минимально необходимых разрешений**: не добавляйте новые permissions без реальной необходимости.
2. Если ваш виджет использует API Chrome (например, `bookmarks`, `history`, `alarms`) — добавьте permission в манифест и обновите документацию.
3. Проверяйте fallback-поведение, если API недоступен (`chrome.*` может быть `undefined` вне extension context).
4. Помните, что изменение permissions влияет на UX установки/обновления (Chrome показывает пользователю новые требования доступа).

## Практические рекомендации для сторонних разработчиков

- Держите виджет автономным: одна папка, локальные компоненты, `index.ts` как точка входа.
- Не храните тяжелые бинарные данные в `chrome.storage.local`.
- Валидируйте внешние данные (API-ответы) перед сохранением.
- Не полагайтесь на порядок загрузки виджетов — registry формируется динамически.
- Для совместимости держите layout-ограничения (`minW`, `minH`, `maxW`, `maxH`) явными.

## Чеклист при добавлении нового виджета

- [ ] Создана папка `src/widgets/<Name>/`
- [ ] Есть `index.ts` с `meta` и `Component`
- [ ] `widgetType` уникален
- [ ] Корректно заполнен `defaultLayout`
- [ ] Нужные Chrome permissions учтены
- [ ] Есть fallback при отсутствии нужного `chrome.*` API
- [ ] Проверено добавление/удаление виджета в UI
- [ ] Проверено восстановление состояния после перезагрузки расширения

## Полезные команды

```bash
yarn dev
yarn build
yarn lint
```
