

## Plan: Система уведомлений и подписок в #subFlow

### Что будет реализовано

1. **Таблица `subflow_follows`** — подписки пользователей друг на друга
2. **Таблица `subflow_notifications`** — уведомления (реакции, новые посты от подписок)
3. **Edge Function `subflow-notify`** — отправка Push (в таблицу `push_notifications`) и Telegram уведомлений
4. **Database trigger** — автоматический вызов уведомлений при вставке реакции и поста
5. **UI: кнопка "Подписаться"** на постах и колокольчик уведомлений в шапке #subFlow

---

### Шаг 1: Миграция базы данных

**Таблица `subflow_follows`:**
- `id`, `follower_id` (uuid), `following_id` (uuid), `created_at`
- Unique constraint на `(follower_id, following_id)`
- RLS: пользователи видят свои подписки, могут подписываться/отписываться

**Таблица `subflow_notifications`:**
- `id`, `user_id` (получатель), `actor_id` (кто совершил действие), `type` (`reaction` | `new_post`), `post_id`, `reaction` (text, nullable), `is_read` (boolean), `created_at`
- RLS: пользователи видят/обновляют только свои уведомления

Включить realtime для `subflow_notifications`.

### Шаг 2: Edge Function `subflow-notify`

Принимает: `{ type: 'reaction' | 'new_post', postId, actorId, targetUserId?, reaction? }`

Логика:
- **reaction**: находит автора поста, создаёт запись в `subflow_notifications`, отправляет Push + Telegram
- **new_post**: находит всех подписчиков автора (`subflow_follows`), создаёт уведомления для каждого, отправляет Push + Telegram

Telegram: отправка через `TELEGRAM_BOT_TOKEN` (бот `@subday_lgbot`), текст: «💚 Имя поставил(а) реакцию на ваш пост» / «📝 Имя опубликовал(а) новый пост»

Push: вставка в `push_notifications`.

### Шаг 3: Вызов Edge Function из клиента

- В `SubFlowPost.tsx` — после успешной вставки реакции вызывать `supabase.functions.invoke('subflow-notify', { body: { type: 'reaction', postId, actorId, reaction } })`
- В `SubFlowCreatePostDialog.tsx` — после создания поста вызывать `supabase.functions.invoke('subflow-notify', { body: { type: 'new_post', postId, actorId } })`

### Шаг 4: UI — Кнопка подписки

- В `SubFlowPost.tsx` добавить кнопку "Подписаться" рядом с именем автора (если не свой пост)
- Состояние: подписан/не подписан, toggle через `subflow_follows` insert/delete

### Шаг 5: UI — Колокольчик уведомлений

- В шапке `SubFlowPage.tsx` — иконка Bell с badge (количество непрочитанных)
- Выпадающий список уведомлений (Popover/Sheet) с текстом и временем
- Клик по уведомлению — отмечает как прочитанное
- Realtime подписка на `subflow_notifications` для мгновенного обновления badge

---

### Технические детали

- Edge Function `subflow-notify` с `verify_jwt = false` (авторизация проверяется внутри)
- Не отправлять уведомление самому себе (если поставил реакцию на свой пост)
- Telegram ID извлекается из `profiles.phone` (`+telegram_XXXXX`)
- Для не-Telegram пользователей — только Push уведомление

