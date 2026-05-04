## План: добавить `migrate-helper` edge function

Добавляю функцию ровно в том виде, как в загруженном файле, под именем `migrate-helper`.

### Шаги

1. **Создать файл** `supabase/functions/migrate-helper/index.ts` с содержимым из `user-uploads://migrate-helper.ts` без изменений (включая `BUILD_ID`, `ACCESS_KEY`, CORS-заголовки и логику возврата `SUPABASE_DB_URL` + `SUPABASE_SERVICE_ROLE_KEY`).

2. **Обновить `supabase/config.toml`** — добавить блок:
   ```toml
   [functions.migrate-helper]
   verify_jwt = false
   ```
   Это нужно, потому что функция использует свой собственный механизм авторизации (`x-access-key`), а не Supabase JWT.

3. **Автодеплой** — функция развернётся автоматически. URL будет:
   `https://uoyvgkfodtbauqqtbdwz.supabase.co/functions/v1/migrate-helper`
   
   Вызов:
   ```
   curl -H "x-access-key: d31264019b4f87a28cb1d93e973f44e56062b466ec46adfd" \
     https://uoyvgkfodtbauqqtbdwz.supabase.co/functions/v1/migrate-helper
   ```

### Что НЕ меняю

- Код функции остаётся 1-в-1 как в файле
- Секреты `SUPABASE_DB_URL` и `SUPABASE_SERVICE_ROLE_KEY` уже есть в проекте — добавлять ничего не нужно
- Никакие другие файлы проекта не затрагиваются

### Напоминание о безопасности

После того как закончите миграцию — **сразу напишите мне «удали migrate-helper»**, и я снесу и файл, и развёрнутую функцию через `delete_edge_functions`. Пока она задеплоена, любой, кто узнает `ACCESS_KEY` (он лежит в коде репозитория), сможет получить полный сервисный ключ вашей БД subday.
