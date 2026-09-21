# Privacy Policy

**RSTP New Tab** (Chrome extension). Last updated: 2026-09-21.

Short version: the extension has no backend. It stores what you configure in Chrome's own extension storage on your machine, and the only servers it ever contacts are the ones you connect it to yourself.

## What the extension processes

| Data                                                                                                   | Where it is stored                                                                            | Leaves the device?                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Widget layout, background and UI preferences, language, ChromeLibrary and Productivity widget settings | `chrome.storage.sync`                                                                         | Only through Chrome's own profile sync, to your other signed-in Chrome profiles       |
| Todo tasks (titles, descriptions, statuses, projects)                                                  | `chrome.storage.local` while an integration is connected, `chrome.storage.sync` while none is | To the task service you connected; with no integration, through Chrome's profile sync |
| Tab Rules Engine rules and tab-cleanup settings                                                        | `chrome.storage.local`                                                                        | No                                                                                    |
| Activity / screen-time counters — **domain names** and time spent, never full URLs or page contents    | `chrome.storage.local`                                                                        | No                                                                                    |
| Bookmarks, open tabs and tab groups                                                                    | Read through the Chrome APIs on demand and rendered; not stored by the extension              | No                                                                                    |
| Integration credentials (Vikunja instance URL + API token, Trello API key + token)                     | `chrome.storage.local` **only** — never `chrome.storage.sync`                                 | Only to that integration's own host, in a request header                              |

The extension has **no analytics, no telemetry, no crash reporting and no third-party servers**. There is no account to create and nothing is sent to the authors.

## Vikunja integration

- The **instance URL and API token** you enter are stored in `chrome.storage.local` on this device only. They are never written to `chrome.storage.sync`, so they do not travel to your other Chrome profiles. Connecting an integration moves the whole Todo store from `sync` to `local` for exactly this reason.
- The token is sent **only to the instance whose address you typed**, and only in the `Authorization` request header — never in a URL, never in a log line. Requests use `redirect: 'error'`, so a redirect cannot carry the token to another host, and `credentials: 'omit'`, so no cookies are attached.
- Reaching your instance requires a Chrome host permission for that one host. It is requested at runtime, by your explicit action in the connect form, and re-checked before every single operation. Revoking it in `chrome://extensions` stops all Vikunja traffic immediately.
- **Task data cached locally**: task titles, descriptions, statuses and Vikunja task ids are kept in `chrome.storage.local` — in the Todo store's envelope (`todo-widget:v1`), in the background-pull snapshot of the configured view (`vikunja:snapshot:<projectId>:<viewId>`), and, when you disconnect or switch integrations, in a recovery copy of the task list (`todo-widget:handover:v1`, which contains no config and no token and is deleted 30 days later).
- The extension writes **nothing hidden** into your Vikunja tasks: no metadata blobs in descriptions and no comments.

## Trello integration

The Trello API key and token are likewise stored in `chrome.storage.local` only and are sent only to `api.trello.com`, which is the single host declared in the extension's manifest. Card titles, descriptions and list assignments are cached in the same local Todo store. The Trello adapter does write a small hidden metadata block at the end of a card's description, so that a card can be matched back to its local task.

## Permissions and why they exist

`storage` (persistence), `tabs` and `tabGroups` (the Tab Rules Engine and tab cleanup), `bookmarks` (the ChromeLibrary widget), `alarms` (cleanup scheduler and the Vikunja background pull), `notifications` (asking before closing tabs), `idle` (so activity tracking does not count time away from the machine). Host access: `https://api.trello.com/*` at install, plus one optional host you grant yourself when connecting a self-hosted service.

## Deleting your data

- **Disconnect an integration** (Todo widget settings → Disconnect): the config and token are removed. A copy of the task list is kept under `todo-widget:handover:v1` for 30 days in case the next connection goes wrong; to drop it at once, run `await chrome.storage.local.remove('todo-widget:handover:v1')` in the DevTools console of an extension page.
- **Revoke host access** in `chrome://extensions` → Details → Site access: all traffic to that host stops.
- **Remove the extension**: Chrome deletes its entire storage, local and synced alike. Nothing remains anywhere else, because there is nowhere else.

Data in your Vikunja instance or Trello board belongs to those services; delete it there.

## Contact

Open an issue in this repository.

---

# Политика конфиденциальности

**RSTP New Tab** (расширение Chrome). Обновлено: 2026-09-21.

Коротко: у расширения нет серверной части. Всё, что вы настраиваете, лежит в хранилище расширений Chrome на вашей машине, а единственные серверы, к которым расширение обращается, — те, которые вы подключили сами.

## Какие данные обрабатываются

| Данные                                                                                                         | Где хранятся                                                                                    | Покидают устройство?                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Раскладка виджетов, фон, настройки интерфейса, язык, настройки виджетов ChromeLibrary и Productivity           | `chrome.storage.sync`                                                                           | Только через собственную синхронизацию профиля Chrome — в другие ваши профили Chrome  |
| Задачи Todo (заголовки, описания, статусы, проекты)                                                            | `chrome.storage.local` при подключённой интеграции, `chrome.storage.sync` — пока интеграции нет | В подключённый вами сервис задач; без интеграции — через синхронизацию профиля Chrome |
| Правила Tab Rules Engine и настройки очистки вкладок                                                           | `chrome.storage.local`                                                                          | Нет                                                                                   |
| Счётчики активности и экранного времени — **домены** и проведённое время, без полных URL и содержимого страниц | `chrome.storage.local`                                                                          | Нет                                                                                   |
| Закладки, открытые вкладки и группы вкладок                                                                    | Читаются через Chrome API по требованию и отрисовываются; расширением не сохраняются            | Нет                                                                                   |
| Учётные данные интеграций (адрес инстанса Vikunja + API-токен, ключ и токен Trello)                            | `chrome.storage.local` — **никогда** `chrome.storage.sync`                                      | Только на хост самой интеграции, в заголовке запроса                                  |

В расширении **нет аналитики, телеметрии, сбора ошибок и сторонних серверов**. Аккаунт создавать не нужно, авторам ничего не отправляется.

## Интеграция с Vikunja

- **Адрес инстанса и API-токен** хранятся в `chrome.storage.local` только на этом устройстве. Они никогда не пишутся в `chrome.storage.sync`, поэтому не уезжают в другие ваши профили Chrome: подключение интеграции именно для этого переводит весь Todo-стор с `sync` на `local`.
- Токен уходит **только на тот инстанс, адрес которого вы ввели**, и только в заголовке `Authorization` — не в URL и не в логи. Запросы идут с `redirect: 'error'` (редирект не сможет унести токен на чужой хост) и `credentials: 'omit'` (куки не прикладываются).
- Чтобы обратиться к инстансу, нужен host-permission Chrome на этот один хост. Он запрашивается в рантайме — вашим явным действием в форме подключения — и перепроверяется перед каждой операцией. Отзыв разрешения в `chrome://extensions` мгновенно прекращает любой трафик к Vikunja.
- **Что кешируется локально**: заголовки, описания, статусы задач и их id в Vikunja лежат в `chrome.storage.local` — в envelope Todo-стора (`todo-widget:v1`), в снапшоте фонового пулла настроенного вью (`vikunja:snapshot:<projectId>:<viewId>`) и, при отключении или смене интеграции, в резервной копии списка задач (`todo-widget:handover:v1` — без конфига и токена, удаляется через 30 дней).
- В ваши задачи в Vikunja расширение **не пишет ничего скрытого**: ни метаданных в описаниях, ни комментариев.

## Интеграция с Trello

Ключ и токен Trello так же хранятся только в `chrome.storage.local` и отправляются только на `api.trello.com` — единственный хост, заявленный в манифесте. Заголовки, описания и списки карточек кешируются в том же локальном Todo-сторе. Адаптер Trello дописывает небольшой блок скрытых метаданных в конец описания карточки, чтобы сопоставить её с локальной задачей.

## Разрешения и зачем они

`storage` (хранение), `tabs` и `tabGroups` (Tab Rules Engine и очистка вкладок), `bookmarks` (виджет ChromeLibrary), `alarms` (планировщик очистки и фоновый пулл Vikunja), `notifications` (спросить перед закрытием вкладок), `idle` (чтобы трекинг активности не считал время, когда вас нет за машиной). Доступ к хостам: `https://api.trello.com/*` при установке плюс один опциональный хост, который вы выдаёте сами при подключении self-hosted сервиса.

## Как удалить данные

- **Отключить интеграцию** (настройки Todo-виджета → «Отключить»): конфиг и токен удаляются. Копия списка задач остаётся под ключом `todo-widget:handover:v1` на 30 дней — на случай, если следующее подключение пойдёт не так; удалить её сразу можно из консоли DevTools страницы расширения: `await chrome.storage.local.remove('todo-widget:handover:v1')`.
- **Отозвать доступ к хосту** в `chrome://extensions` → «Подробнее» → «Доступ к сайтам»: трафик к этому хосту прекращается.
- **Удалить расширение**: Chrome стирает всё его хранилище — и локальное, и синхронизируемое. Больше нигде ничего не остаётся, потому что больше нигде ничего и не было.

Данные в вашем инстансе Vikunja или на доске Trello принадлежат этим сервисам — удаляйте их там.

## Контакты

Issue в этом репозитории.
