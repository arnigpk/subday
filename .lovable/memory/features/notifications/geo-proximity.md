---
name: Geo-уведомления о ближайших кофейнях
description: Push-уведомления при попадании в радиус кофейни-партнёра, серверная проверка условий
type: feature
---
Гео-уведомления (trigger_type='geo_proximity' в auto_notification_templates):

**Архитектура:**
- Клиент: `useGeoNotifications` (foreground watchPosition через `useGeolocation`) считает Haversine до shops.coordinates, если в радиусе ≤250м — вызывает edge function `geo-notify` с топ-3 кандидатами.
- Локальный кулдаун клиента: 30 минут между вызовами edge function.
- Edge function `geo-notify` (verify_jwt по умолчанию, валидация токена в коде) проверяет ВСЕ условия и шлёт FCM напрямую.

**Условия отправки:**
1. `profiles.geo_notifications_enabled = true`
2. Шаблон `geo_proximity` активен
3. Активная подписка
4. < daily_limit (2) уведомлений за сегодня
5. Кофейня не уведомляла за последние 12ч
6. Не было redemption за 12ч
7. Кофейня сейчас открыта (UTC+5 для KZ)
8. Расстояние ≤ radius_meters (250)

**Логика выбора кофеен:**
- Берём до `max_shops_per_check` (3) ближайших подходящих.
- **Dominant Gap:** если разница между nearest и 2-й ≥ `dominant_gap_m` (150м) — оставляем ТОЛЬКО ближайшую. Это даёт чистое релевантное уведомление.

**Push-friendly формат сообщения:**
- Шаблон по умолчанию: `Загляни на кофе по подписке: {{shops_inline}}`
- `{{shops_inline}}`: «Coffee Bean 120 м, Starbucks 230 м» (через запятую, без тире, без \n)
- Заголовок: «Кофейня рядом ☕» (короткий, безопасный для push)
- Длина body ≤120 символов — корректно отображается на всех устройствах
- Избегаем `\n` (переносы строк плохо рендерятся в системных push-баннерах)

**Переменные шаблона:**
- `{{shops_inline}}` — список через запятую (РЕКОМЕНДУЕТСЯ для push)
- `{{shops_list}}` — список через • (для in-app)
- `{{shop_name}}` — название ближайшей
- `{{distance}}` — отформатированное расстояние ближайшей («120 м» / «1.2 км»)
- `{{count}}` — количество кофеен
- `{{name}}` — имя пользователя

**Таблицы:**
- `geo_notification_log (user_id, shop_id, sent_at, distance_meters)` — для дедупликации и дневного лимита.
- `profiles.geo_notifications_enabled boolean` — пользовательский тумблер.

**Доставка:** в одном уведомлении 1 кофейня (если она явно ближе) или до 3 (если все рядом). In-app + FCM push на все device_tokens, data.route='/shops', shop_id = ближайшая.
