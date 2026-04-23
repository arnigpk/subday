

# Полное зеркало Lovable Cloud → ваш Supabase (одноразовый дамп для скачивания)

## Цель
Создать **полную копию** проекта Lovable Cloud в вашем привязанном через Connectors Supabase. После завершения вы отвяжете Connectors и скачаете дамп из своего Supabase. Текущее приложение продолжает работать на Lovable Cloud — ничего в коде не меняется.

## Что будет скопировано (полный реестр)

### 1. База данных PostgreSQL
- **43 таблицы** схемы `public` (структура + все данные)
- **24 функции БД** (все `activate_subscription`, `has_role`, `grant_guest_access`, `realtime_can_access`, `get_subflow_ad_analytics` ×2, и т.д.)
- **Все RLS-политики, триггеры, индексы**
- **Enum** `app_role`
- **Auth-пользователи** (`auth.users`, `auth.identities`) — экспорт через Admin API в JSON (pg_dump к `auth` схеме закрыт в Lovable Cloud)

### 2. Storage (5 публичных bucket'ов)
`avatars`, `shop-logos`, `subflow-images`, `ad-banners`, `app-assets` — все файлы поштучно с сохранением путей.

### 3. Edge Functions (27 шт.)
Полный исходный код всех функций будет скопирован в новый проект через Supabase Management API:
`send-otp`, `verify-otp`, `telegram-auth`, `telegram-bot-webhook`, `telegram-miniapp-auth`, `telegram-generate-code`, `telegram-verify-code`, `telegram-broadcast`, `partner-scan-qr`, `partner-ad-request`, `expire-subscriptions`, `expire-ads`, `expire-preorders`, `send-subscription-notification`, `check-subscription-alerts`, `create-payment`, `freedompay-webhook`, `verify-payment`, `geo-notify`, `guest-access`, `delete-account`, `subflow-notify`, `subflow-ai-caption`, `send-fcm-push`, `preorder-notify`, `translate-text` + `_shared/edgeLogger.ts`.

### 4. Secrets (16)
Будет создан **шаблонный bash-скрипт** `secrets-import.sh`, в который вы один раз вставите значения из текущего Lovable Cloud (значения секретов недоступны для чтения через API даже мне — это by design Supabase). Перечень имён секретов уже известен: `FREEDOMPAY_SECRET_KEY`, `FREEDOMPAY_MERCHANT_ID`, `TELEGRAM_BOT_TOKEN`, `NOTIFICATION_BOT_TOKEN`, `NOTIFICATION_CHAT_ID`, `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_WHATSAPP_SENDER`, `SMSC_LOGIN`, `SMSC_PASSWORD`, `LOVABLE_API_KEY` (+ `SUPABASE_*` создаются в новом проекте автоматически).

### 5. Cron-задачи (`pg_cron`)
Будут экспортированы как SQL-файл `cron-jobs.sql` со всеми 4 задачами (`expire-subscriptions`, `expire-ads`, `expire-preorders`, `check-subscription-alerts`). **В новом проекте они не будут активированы** — чтобы не дублировать выполнение и не отправлять пользователям двойные уведомления. Вы сможете их включить вручную, если решите переключаться на новый Supabase.

### 6. Webhook'и и конфигурация
Будет создан файл `external-config.md` со списком всех внешних URL, которые ссылаются на текущий Cloud (FreedomPay postlink, Telegram `setWebhook`, BotFather TMA URL, Apple/Google App Site Association). Это **справочная информация** — переключать вы их не будете, так как продолжаете работать на Lovable Cloud.

## Технический план

### Этап 1. Подключение Connectors → Supabase
Я вызову `standard_connectors--list_connections`, чтобы найти ваш привязанный Supabase. Если он ещё не залинкован к проекту — попрошу залинковать через `standard_connectors--connect`.

### Этап 2. Получение credentials нового Supabase
Из конфигурации связи я получу:
- `NEW_SUPABASE_URL`
- `NEW_SUPABASE_SERVICE_ROLE_KEY`
- `NEW_SUPABASE_PROJECT_REF`
- `NEW_SUPABASE_DB_URL` (connection string)

Если Connectors не отдаёт `service_role` напрямую — попрошу вас один раз ввести его как secret через `add_secret`.

### Этап 3. Дамп исходного Cloud (выполняется через `code--exec`)
Через `SUPABASE_DB_URL` (уже есть в secrets):
```bash
pg_dump --schema-only --schema=public $SUPABASE_DB_URL > /mnt/documents/db-mirror/01-schema.sql
pg_dump --data-only --schema=public $SUPABASE_DB_URL > /mnt/documents/db-mirror/02-data.sql
pg_dump --schema=cron --data-only $SUPABASE_DB_URL > /mnt/documents/db-mirror/03-cron.sql
```
Auth-пользователи через Admin API (postgres-meta или REST `/auth/v1/admin/users`):
```bash
curl ... > /mnt/documents/db-mirror/04-auth-users.json
```

### Этап 4. Restore в ваш Supabase
```bash
psql $NEW_SUPABASE_DB_URL -f 01-schema.sql
psql $NEW_SUPABASE_DB_URL -f 02-data.sql
# auth-пользователи импортируются через Admin API нового проекта
node /tmp/import-auth-users.js
```

### Этап 5. Зеркалирование Storage
Node-скрипт `mirror-storage.ts`:
1. Перебирает все 5 bucket'ов в Cloud.
2. Для каждого файла: скачивает через signed URL → загружает в одноимённый bucket нового Supabase.
3. Логирует прогресс и ошибки.

### Этап 6. Деплой Edge Functions в новый Supabase
Через Supabase Management API (`POST /v1/projects/{ref}/functions`):
- Читаем код каждой функции из `supabase/functions/`.
- Создаём функцию в новом проекте с тем же `verify_jwt` флагом из `config.toml`.

### Этап 7. Шаблон для Secrets
Создаю файл `/mnt/documents/db-mirror/secrets-import.sh`:
```bash
#!/bin/bash
# Заполните значения и запустите локально
supabase secrets set --project-ref NEW_REF \
  FREEDOMPAY_SECRET_KEY="..." \
  FREEDOMPAY_MERCHANT_ID="..." \
  TELEGRAM_BOT_TOKEN="..." \
  ...
```

### Этап 8. Верификация
SQL-скрипт `verify.sh` сравнивает `count(*)` по всем 43 таблицам между двумя БД и выводит таблицу:
```
table_name              | source_count | target_count | diff
profiles                |        1247  |        1247  |    0
subflow_posts           |         892  |         892  |    0
...
```

### Этап 9. Финальный архив для скачивания
Все артефакты собираются в `/mnt/documents/db-mirror/` и доступны через `<lov-artifact>`:
- `01-schema.sql`, `02-data.sql`, `03-cron.sql`, `04-auth-users.json`
- `edge-functions/` (27 папок с index.ts)
- `secrets-import.sh` (шаблон)
- `external-config.md` (URL'ы webhook'ов)
- `verify-report.txt` (отчёт сверки)
- `README.md` (инструкция как восстановить из этих файлов в любом Supabase)

## Что вы получите в итоге
1. **Полная рабочая копия** проекта в вашем привязанном Supabase.
2. **Архив всех файлов** в `/mnt/documents/db-mirror/` для скачивания — на случай, если позже захотите развернуть копию где угодно.
3. **Lovable Cloud работает как прежде** — ни код, ни `.env`, ни `client.ts`, ни webhook'и не трогаются.
4. После успешной верификации вы можете спокойно отвязать Supabase из Connectors — данные в вашем Supabase останутся.

## Гарантии полноты
| Компонент | Метод копирования | Гарантия |
|---|---|---|
| Структура БД | `pg_dump --schema-only` | Бит-в-бит копия DDL включая RLS, функции, триггеры, индексы |
| Данные БД | `pg_dump --data-only` | Все строки всех 43 таблиц + сверка `count(*)` |
| Auth-пользователи | Admin API export/import | Email, phone, hash паролей, metadata |
| Storage | Listing + download/upload каждого файла | Сверка количества и размеров |
| Edge Functions | Management API | Исходный код всех 27 функций + конфиг verify_jwt |
| Cron | `pg_dump cron` | SQL-файл, готовый к применению (но не активируется) |
| Secrets | Шаблон bash-скрипта | Имена все есть, значения вы вставите один раз |

## Важные оговорки
- **Значения secrets** Supabase не отдаёт через API никому, включая меня. Это by design. Поэтому только `secrets-import.sh` шаблон.
- **Auth JWT secret** у двух проектов разный — пользователи смогут логиниться в новом проекте, но текущие сессии будут невалидны (это не важно, так как вы пока не используете новый проект).
- **Cron-задачи в новом проекте отключены** намеренно, чтобы не было двойного выполнения (двойной expire подписок, двойные уведомления). Скрипт для активации лежит в архиве — применяется одной командой при необходимости.
- **Скрипт деплоя Edge Functions через Management API** требует `SUPABASE_ACCESS_TOKEN` (Personal Access Token из вашего Supabase аккаунта). Если Connectors его не предоставит — попрошу вас сгенерировать его в Supabase Dashboard → Account → Access Tokens и добавить как secret. Это одна минута.

## Время выполнения
- Этапы 1-3 (дамп Cloud): ~5 минут.
- Этапы 4-5 (restore + Storage): ~10-30 минут (зависит от объёма Storage).
- Этап 6 (Edge Functions): ~5 минут.
- Этапы 7-9 (артефакты, верификация): ~5 минут.

**Итого: ~30-60 минут полностью автоматически, без вашего участия (кроме одного ввода access token при необходимости).**

