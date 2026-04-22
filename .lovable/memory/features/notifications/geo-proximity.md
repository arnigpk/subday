---
name: Geo-уведомления о ближайших кофейнях
description: Push-уведомления при попадании в радиус кофейни-партнёра, серверная проверка условий
type: feature
---
Гео-уведомления (trigger_type='geo_proximity' в auto_notification_templates):

**Архитектура:**
- Клиент: `useGeoNotifications` (foreground watchPosition через `useGeolocation`) считает Haversine до shops.coordinates, если в радиусе ≤250м — вызывает edge function `geo-notify` с топ-3 кандидатами.
- Локальный кулдаун клиента: 30 минут между вызовами edge function.
- Edge function `geo-notify` (verify_jwt по умолчанию, валидация токена в коде) проверяет ВСЕ условия и шлёт FCM напрямую (не через send-fcm-push, т.к. та требует admin).

**Условия отправки (все должны выполниться):**
1. `profiles.geo_notifications_enabled = true` (тумблер в профиле, по умолчанию true)
2. Шаблон `geo_proximity` активен в `auto_notification_templates`
3. Активная подписка в `user_subscriptions`
4. < daily_limit (2) уведомлений за сегодня (`geo_notification_log`)
5. Кофейня не уведомляла за последние 12ч (cooldown_hours)
6. Пользователь не делал redemption в этой кофейне за 12ч (visit_cooldown_hours)
7. `shops.working_hours` сейчас открыта (UTC+5 для KZ, парсинг "HH:MM-HH:MM")
8. Расстояние ≤ radius_meters (250)

**Таблицы:**
- `geo_notification_log (user_id, shop_id, sent_at, distance_meters)` — для дедупликации и дневного лимита.
- `profiles.geo_notifications_enabled boolean` — пользовательский тумблер.

**Конфиг шаблона (trigger_config):**
radius_meters, cooldown_hours, visit_cooldown_hours, daily_limit, max_shops_per_check (по умолч. 3), requires_subscription, respect_working_hours, title.

**Переменные шаблона:** `{{shops_list}}` (нумерованный список «N. Название — Xм»), `{{shops_inline}}` (через запятую), `{{count}}`, `{{shop_name}}` (ближайшая), `{{distance}}` (м, ближайшая), `{{name}}`.

**Доставка:** в одном уведомлении до 3 ближайших подходящих кофеен. In-app запись в `push_notifications` + FCM push на все device_tokens пользователя, data.route='/shops', shop_id = ближайшая. Каждая выбранная кофейня логируется в `geo_notification_log` для индивидуального 12ч кулдауна.
