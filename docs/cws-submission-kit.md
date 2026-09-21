# Chrome Web Store submission kit

Draft copy for the CWS listing and the reviewer-facing justification fields. English first, Russian translation below. Keep it in sync with `manifest.config.ts`, the README permissions section and `PRIVACY_POLICY.md`.

## Single purpose

> RSTP New Tab replaces Chrome's new tab page with a configurable dashboard of widgets (search, todo list, bookmarks and tab groups, screen-time summary) and lets the user automate their tabs from that one page.

Everything the extension requests serves that page: reading the user's own bookmarks and tabs to display them, scheduling the tab cleanup the user configured, and — optionally — syncing the todo widget with a task service the user connects themselves.

## Permission justifications

| Permission                                   | Justification                                                                                                                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                    | The only persistence the extension has. Widget layout, appearance, language, the todo list and the tab rules are kept in `chrome.storage`. There is no backend and no account.                                                                                       |
| `tabs`                                       | The Tab Rules Engine and the tab-cleanup feature read the user's open tabs (URL, title, last access) to sort, group, move and close them exactly as the user's own rules say.                                                                                        |
| `tabGroups`                                  | Those same rules create, rename and reorder Chrome tab groups; the ChromeLibrary widget lists existing groups on the new tab page.                                                                                                                                   |
| `bookmarks`                                  | The ChromeLibrary widget renders the user's bookmark tree on the new tab page and opens a bookmark on click. Read-only use; nothing is copied out of Chrome.                                                                                                         |
| `alarms`                                     | MV3 service workers are unloaded when idle, so every scheduled job needs an alarm: the inactive-tab cleanup scheduler, and the optional background pull of the connected task service.                                                                               |
| `notifications`                              | In "ask" cleanup mode the extension notifies the user before closing inactive tabs, so the closure is never silent.                                                                                                                                                  |
| `idle`                                       | Screen-time and activity counters must not count time the user was away from the machine; `chrome.idle` is what distinguishes an open tab from an active one.                                                                                                        |
| `host_permissions: https://api.trello.com/*` | The optional Trello integration of the todo widget talks to exactly one API host, known at build time, so it is declared as a fixed host permission rather than an optional one. No request is made until the user connects Trello with their own API key and token. |
| `optional_host_permissions: https://*/*`     | See below — nothing under this pattern is granted at install.                                                                                                                                                                                                        |

## `optional_host_permissions: ["https://*/*"]` — the one that needs explaining

**Nothing under this pattern is granted at install time.** It is declared as _optional_ precisely so the install prompt asks for none of it.

The todo widget can sync with [Vikunja](https://vikunja.io/), a **self-hosted** task tracker. A self-hosted instance lives at an address only its owner knows — `https://tasks.alice.example`, `https://vikunja.mycompany.internal:8443`, anything. There is no fixed host we could declare in `host_permissions`, and no list of hosts we could enumerate, so the broad pattern is the only thing Chrome's permission model lets us declare up front.

What actually happens at runtime:

1. The user opens the todo widget's settings, picks Vikunja, and types their instance URL and a personal API token.
2. When they press **Connect**, the extension calls `chrome.permissions.request({ origins: ['https://<their-host>/*'] })` **synchronously inside that click**, for that single host and nothing else. The pattern is built from the parsed URL's hostname by one shared function (`vikunjaHostPattern`).
3. Only literal https hosts are accepted. `http`, wildcard hosts (`https://*`, `https://%2A`, `https://*.example.com`), URLs with credentials, queries or fragments, and IPv6 literals are all rejected _before_ the request is made, so no input can widen the grant into "all sites".
4. If the user declines the prompt, nothing is saved and no request is made.
5. Every subsequent operation — including the background pull, which runs with no page open — re-checks the grant with `chrome.permissions.contains` before a single byte reaches the network (`withVikunjaClient` in `src/background/vikunja/gate.ts`). The answer is never cached.
6. The user can revoke the host at any time in `chrome://extensions` → Details → Site access. Syncing stops immediately and the widget shows a banner explaining why, with a button that re-requests it.

Additional safeguards a reviewer may want to check:

- The API token is sent **only** to the instance the user typed, and **only** in the `Authorization` header — never in a URL and never logged. The single `fetch` to a Vikunja instance in the whole codebase is in `src/background/vikunja/client.ts`, and it uses `redirect: 'error'` (so a redirect cannot carry the token to another host), `credentials: 'omit'` and `cache: 'no-store'`.
- The token and instance URL are stored in `chrome.storage.local` only — never `chrome.storage.sync`, so they do not leave the device.
- The page cannot use the worker as an open proxy: the worker re-validates the config and re-checks the host permission itself, independently of whatever the page sends it.

**Why the page cannot just `fetch` the instance directly:** Vikunja answers a CORS preflight from a `chrome-extension://` origin with `204` and no `Access-Control-*` headers at all (measured on Vikunja 2.6; see `docs/vikunja-recon.md`, Q17). Background fetches from the service worker under a host permission are not subject to CORS, which is why the host permission is needed at all, and why the transport goes through the worker.

## Data use disclosures

- No data is collected by the developer. No analytics, no telemetry, no crash reporting, no third-party servers, no ads.
- No data is sold or transferred to third parties.
- The only network traffic the extension originates goes to (a) `api.trello.com`, and (b) the self-hosted instance the user connected — both only when the user configured that integration.
- Full text: `PRIVACY_POLICY.md` in the repository.

## Test instructions for the reviewer

Most of the extension needs no setup: install it, open a new tab, add widgets from the "+" dialog, and open the toolbar popup to try the Tab Rules Engine.

To exercise the Vikunja integration you need **any** Vikunja instance and an API token for it — we cannot ship a demo instance, because the whole point of the feature is that the instance is the user's own. Either of these works:

1. **Any instance you can reach.** A `docker run` of the official `vikunja/vikunja` image, a public Vikunja demo, or any hosted instance. It must be reachable over **https** — the extension refuses `http`, because the token is sent on every request.
2. Create a token in Vikunja: **Settings → API tokens**. Scopes needed: `tasks`, `tasks_labels`, `projects.read_all`; add `projects.views_buckets_put` and `views_buckets_delete` if you want to try the wizard's "create missing columns" step.

Then:

1. New tab → add the **Todo** widget → its settings (gear) → **"Connect an integration"** → **Vikunja**.
2. Enter the instance URL (`https://…`) and the token, press **Connect**. Chrome will show the host permission prompt — this is the runtime request described above. Accept it. Declining it is also worth trying: nothing is saved.
3. Pick a project that has a kanban view.
4. In the mapping step, either map the buckets to the five statuses (they are pre-matched by name) or press **Skip — flat mode**.
5. Create a task in the widget, then change it in Vikunja's web UI, then press **Sync now** in the widget footer — the change appears. Leaving the tab open for the configured background interval (1/5/15 min, default 5) shows the same change arriving without any interaction.
6. To see the revocation path: `chrome://extensions` → this extension → Details → Site access → remove the host. The widget shows "The extension lost permission for `<host>`" with a **Grant again** button.

No credentials of ours are needed anywhere, and the extension contacts no server other than the instance you entered.

---

# Материалы для отправки в Chrome Web Store

Черновик текстов для листинга и полей обоснования для ревьюера. Держите в соответствии с `manifest.config.ts`, разделом разрешений в README и `PRIVACY_POLICY.md`.

## Единственное назначение (single purpose)

> RSTP New Tab заменяет страницу новой вкладки Chrome настраиваемым дашбордом из виджетов (поиск, список задач, закладки и группы вкладок, сводка экранного времени) и позволяет автоматизировать вкладки с этой же страницы.

Всё, что расширение запрашивает, работает на эту страницу: чтение собственных закладок и вкладок пользователя, чтобы их показать; планировщик очистки вкладок, настроенный самим пользователем; и — опционально — синхронизация Todo-виджета с сервисом задач, который пользователь подключает сам.

## Обоснование разрешений

| Разрешение                                   | Обоснование                                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                    | Единственное хранилище расширения. Раскладка виджетов, оформление, язык, список задач и правила вкладок лежат в `chrome.storage`. Серверной части и аккаунтов нет.                                                   |
| `tabs`                                       | Tab Rules Engine и очистка вкладок читают открытые вкладки пользователя (URL, заголовок, время последнего обращения), чтобы сортировать, группировать, перемещать и закрывать их строго по его собственным правилам. |
| `tabGroups`                                  | Те же правила создают, переименовывают и переупорядочивают группы вкладок Chrome; виджет ChromeLibrary показывает существующие группы на новой вкладке.                                                              |
| `bookmarks`                                  | Виджет ChromeLibrary отображает дерево закладок пользователя на новой вкладке и открывает закладку по клику. Только чтение, ничего из Chrome не выгружается.                                                         |
| `alarms`                                     | Service worker в MV3 выгружается при простое, поэтому любая отложенная работа требует alarm'а: планировщик очистки неактивных вкладок и опциональный фоновый пулл подключённого сервиса задач.                       |
| `notifications`                              | В режиме «спрашивать» расширение уведомляет пользователя перед закрытием неактивных вкладок, чтобы закрытие никогда не было молчаливым.                                                                              |
| `idle`                                       | Счётчики активности и экранного времени не должны учитывать время, когда пользователя не было за машиной; `chrome.idle` отличает открытую вкладку от активной.                                                       |
| `host_permissions: https://api.trello.com/*` | Опциональная интеграция Todo-виджета с Trello обращается ровно к одному хосту API, известному на этапе сборки.                                                                                                       |
| `optional_host_permissions: https://*/*`     | См. ниже — при установке по этому паттерну не выдаётся ничего.                                                                                                                                                       |

## `optional_host_permissions: ["https://*/*"]` — то, что требует объяснения

**При установке по этому паттерну не выдаётся ничего.** Он объявлен именно как _optional_, чтобы установочный запрос не просил по нему ни одного хоста.

Todo-виджет умеет синхронизироваться с [Vikunja](https://vikunja.io/) — **self-hosted** трекером задач. Инстанс на своём сервере живёт по адресу, который знает только его владелец: `https://tasks.alice.example`, `https://vikunja.mycompany.internal:8443`, какой угодно. Фиксированного хоста, который можно было бы заявить в `host_permissions`, не существует, перечислить их списком тоже нельзя — поэтому широкий паттерн это единственное, что позволяет заявить модель разрешений Chrome.

Что происходит в рантайме:

1. Пользователь открывает настройки Todo-виджета, выбирает Vikunja и вводит адрес своего инстанса и персональный API-токен.
2. По нажатию **«Подключить»** расширение вызывает `chrome.permissions.request({ origins: ['https://<его-хост>/*'] })` **синхронно внутри этого клика**, для одного этого хоста и ни для чего больше. Паттерн строится из hostname разобранного URL одной общей функцией (`vikunjaHostPattern`).
3. Принимаются только литеральные https-хосты. `http`, wildcard-хосты (`https://*`, `https://%2A`, `https://*.example.com`), URL с логином/паролем, query или фрагментом и IPv6-литералы отклоняются **до** запроса, поэтому никакой ввод не может расширить грант до «всех сайтов».
4. Если пользователь отказывается — ничего не сохраняется и ни один запрос не отправляется.
5. Каждая последующая операция — включая фоновый пулл, который работает без открытой страницы — заново проверяет грант через `chrome.permissions.contains`, прежде чем в сеть уйдёт хоть один байт (`withVikunjaClient` в `src/background/vikunja/gate.ts`). Результат проверки не кешируется.
6. Пользователь может отозвать доступ в любой момент: `chrome://extensions` → «Подробнее» → «Доступ к сайтам». Синхронизация останавливается немедленно, а виджет показывает баннер с объяснением и кнопкой повторного запроса.

Что ещё можно проверить:

- API-токен уходит **только** на тот инстанс, который ввёл пользователь, и **только** в заголовке `Authorization` — не в URL и не в логи. Единственный `fetch` к инстансу Vikunja во всём проекте находится в `src/background/vikunja/client.ts` и использует `redirect: 'error'` (редирект не сможет унести токен на другой хост), `credentials: 'omit'` и `cache: 'no-store'`.
- Токен и адрес инстанса хранятся только в `chrome.storage.local`, никогда в `chrome.storage.sync`, поэтому не покидают устройство.
- Страница не может использовать воркер как открытый прокси: воркер сам заново валидирует конфиг и заново проверяет host-permission, независимо от того, что ему прислали.

**Почему страница не может обратиться к инстансу напрямую:** на CORS-preflight с origin `chrome-extension://` Vikunja отвечает `204` вообще без заголовков `Access-Control-*` (замерено на Vikunja 2.6, см. `docs/vikunja-recon.md`, вопрос 17). Фоновые запросы из service worker'а под host-permission под CORS не попадают — именно поэтому разрешение на хост вообще нужно и почему транспорт идёт через воркер.

## Раскрытие использования данных

- Разработчик не собирает никаких данных. Нет аналитики, телеметрии, сбора ошибок, сторонних серверов и рекламы.
- Данные не продаются и не передаются третьим лицам.
- Единственный исходящий трафик расширения идёт (а) на `api.trello.com` и (б) на self-hosted инстанс, подключённый пользователем — и только если пользователь настроил соответствующую интеграцию.
- Полный текст: `PRIVACY_POLICY.md` в репозитории.

## Инструкции для тестирования ревьюером

Большая часть расширения не требует подготовки: установите, откройте новую вкладку, добавьте виджеты через диалог «+», откройте popup на панели инструментов для Tab Rules Engine.

Чтобы проверить интеграцию с Vikunja, нужен **любой** инстанс Vikunja и API-токен к нему — демо-инстанс мы приложить не можем, потому что весь смысл функции в том, что инстанс принадлежит пользователю. Подойдёт любое из двух:

1. **Любой доступный инстанс.** `docker run` официального образа `vikunja/vikunja`, публичное демо Vikunja или любой хостинг. Обязательно по **https** — `http` расширение отклоняет, потому что токен уходит с каждым запросом.
2. Создайте токен в Vikunja: **«Настройки» → «API-токены»**. Нужны скоупы `tasks`, `tasks_labels`, `projects.read_all`; добавьте `projects.views_buckets_put` и `views_buckets_delete`, если хотите проверить шаг мастера «создать недостающие колонки».

Дальше:

1. Новая вкладка → добавьте виджет **Todo** → его настройки (шестерёнка) → шаг **«Подключить интеграцию»** → **Vikunja**.
2. Введите адрес инстанса (`https://…`) и токен, нажмите **«Подключить»**. Chrome покажет запрос разрешения на хост — это и есть рантайм-запрос, описанный выше. Примите его. Отказ тоже стоит попробовать: ничего не сохранится.
3. Выберите проект с канбан-вью.
4. На шаге маппинга либо сопоставьте бакеты пяти статусам (они предварительно сопоставлены по названиям), либо нажмите **«Пропустить — плоский режим»**.
5. Создайте задачу в виджете, измените её в веб-интерфейсе Vikunja и нажмите **«Sync now»** в футере виджета — изменение появится. Если оставить вкладку открытой на настроенный интервал фоновой синхронизации (1/5/15 мин, по умолчанию 5), то же изменение придёт само, без единого действия.
6. Проверить отзыв разрешения: `chrome://extensions` → это расширение → «Подробнее» → «Доступ к сайтам» → уберите хост. Виджет покажет «У расширения отозвано разрешение на `<хост>`» и кнопку **«Выдать снова»**.

Никакие наши учётные данные нигде не нужны, и расширение не обращается ни к одному серверу, кроме введённого вами инстанса.
