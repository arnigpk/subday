# План интеграции Rosta POS (next.rosta.kz)

Статус: **план готов, реализация по команде**. Аналогично iiko и Poster — кабинет
партнёра, сканирование → заказ на кассе, единый журнал. Правило «1 активная
интеграция на кофейню» распространяется и на Rosta (iiko ⊕ Poster ⊕ Rosta).

## 1. API Rosta — сводка (изучено из https://next.rosta.kz/docs)

- **Base URL:** `https://next.rosta.kz/api/client/public`
- **Авторизация:** заголовок `Authorization: Bearer {API_KEY}`. Ключ **у каждого
  партнёра свой** (как токен Poster). Отдельного app-level appId/secret НЕ нужно —
  в `.env.functions` ничего добавлять не надо.
- **Формат ответа:** Laravel-стиль. Все GET-списки:
  `{ "data": [...], "meta": { current_page, last_page, per_page:20, total } }`
  → **есть пагинация**, per_page=20. Списки товаров/точек надо листать до
  `current_page >= last_page`.
- **Формат ошибок:** Laravel — `{ "message": "...", "errors": {...} }`; 401 →
  `{ "message": "Unauthenticated." }`. Обрабатывать по `message`.
- **Цены:** `items[].price` — целое число **в тенге** (не тиын/копейки!).
  Пример: Латте 0,5 → `price: 1500`. В отличие от Poster (там копейки) —
  **делить на 100 НЕ надо**. Хранить и передавать как есть.
- **Статус:** API в alpha-тестировании.

### Нужные эндпоинты

| Назначение | Метод | Путь |
|---|---|---|
| Список торговых точек | GET | `/tradepoints` |
| Список товаров (меню) | GET | `/items?price_type_id=&parent_id=` |
| Виды цен | GET | `/price-types` |
| Список касс | GET | `/cashboxes` |
| Способы оплаты | GET | `/payment-methods` |
| Сотрудники front-офиса | GET | `/users/front` |
| Список смен | GET | `/shifts` |
| Открыть смену | POST | `/shifts` |
| Закрыть смену | POST | `/shifts/{id}/close` |
| **Создать чек/счёт** | POST | `/orders` |
| **Закрыть (оплатить) чек** | POST | `/orders/{id}/close` |
| Показать чек | GET | `/orders/{id}` |

### Схемы (точные имена полей)

**POST `/orders`** — тело:
```json
{
  "shift_id": "<uuid>",              // ОБЯЗАТЕЛЬНО — нужна открытая смена
  "client_id": "<uuid>",            // необяз.
  "table_id": "<uuid>",             // необяз.
  "items": [
    { "id": "<uuid товара>", "count": 1, "price": 1500, "attribute_id": "<uuid>" }
  ]
}
```
Ответ: `data.id` (id чека), `data.num`, `data.status.value` (0=Открыт, 1=Распечатан,
3=Оплачен), `data.payments{accepted,cash,cashless,bonus,other}`, `data.shift`,
`data.cashbox`, `data.items[]`.

**POST `/orders/{id}/close`** — тело:
```json
{
  "cashbox_id": "<uuid кассы>",
  "payments": [ { "method_id": "<uuid способа оплаты>", "sum": 1500 } ]
}
```
После закрытия статус → `3` (Оплачен).

**POST `/shifts`** — тело: `{ "tradepoint_id": "<uuid>", "user_id": "<uuid front-сотрудника>", "workplace_group_id": "<uuid|необяз>" }` → `data.id` (id смены).

**GET `/shifts`** — `data[]`: `{ id, user_id, tradepoint_id, opened_at, closed_at, ... }`.
Открытая смена = `closed_at == null`.

**GET `/items`** — `data[]`: `{ id, name, price(int тенге), type_id, unit_id, parent_id }`.
**GET `/tradepoints`** — `data[]`: `{ id, name, doc_prefix, warehouse_id }`.
**GET `/cashboxes`** — `data[]`: `{ id, name, type, tradepoint_id }` (фильтровать по точке).
**GET `/payment-methods`** — `data[]`: `{ id, name, system_name, type(1=Нал,2=Безнал,3=Бонус,4=Долг), terminal_type }`.
**GET `/users/front`** — `data[]`: `{ id, name, parent_id }`.

## 2. Ключевые отличия Rosta от iiko/Poster (влияют на архитектуру)

1. **Нужна открытая смена.** Чтобы создать чек, обязателен `shift_id`. Логика:
   - GET `/shifts` → найти открытую (`closed_at==null`) для нужной точки → взять её id.
   - Если открытой нет и включено «авто-открытие смены» + задан `user_id` →
     POST `/shifts` открыть новую. Иначе — понятная ошибка «Смена не открыта на кассе Rosta».
2. **Нет отмены/аннулирования чека в публичном API.** Нет DELETE `/orders`,
   статусов «отменён» нет. → Для Rosta кнопка «Отмена» в журнале **недоступна**;
   `cancelPosOrder` для provider='rosta' возвращает
   `{ok:false, error:'Rosta API не поддерживает отмену чека — отмените вручную на кассе'}`,
   UI показывает это (кнопка задизейблена + подсказка).
3. **Автозакрытие** = вызвать `/orders/{id}/close` с `cashbox_id` + выбранным
   `payment_method_id` на всю сумму. Для этого в настройках интеграции нужно заранее
   выбрать **кассу** и **способ оплаты** (в Poster хватало payment.type=1, здесь нужны id).
4. **Цены в тенге** (целые), не в копейках.

## 3. Модель данных (миграция `*_rosta_integration.sql`)

`rosta_integrations` (mirror `poster_integrations`):
- `shop_id uuid PK → shops`
- `api_key text` (секрет, Bearer)
- `tradepoint_id text`, `tradepoint_name text`
- `cashbox_id text`, `cashbox_name text`      — для закрытия чека
- `payment_method_id text`, `payment_method_name text` — для закрытия чека
- `user_id text`, `user_name text`            — для открытия смены
- `price_type_id text` (необяз., для цен меню)
- `auto_open_shift bool default true`         — открывать смену, если нет открытой
- `currency text default 'KZT'`
- `auto_close bool default true`
- `is_active bool default false`
- `created_at/updated_at`

`rosta_menu_map` (mirror `poster_menu_map`):
- `shop_id × subscription_type_id` (PK) → `rosta_item_id text`, `rosta_item_name text`,
  `rosta_price numeric` (тенге)

RLS: через `is_shop_partner` (как у poster/iiko).
`iiko_order_log`: колонки `provider` + `pos_order_id` уже есть (добавлены в
миграции Poster). Для Rosta: `provider='rosta'`, `pos_order_id = id чека`.
Отмена не поддерживается.

## 4. Бэкенд

### `supabase/functions/_shared/rosta.ts` (mirror poster.ts)
- `ROSTA_BASE`, `RostaError`, `checkError`
- `rostaGet(apiKey, path, params?)` — Bearer, **листает все страницы** по `meta`.
- `rostaPost(apiKey, path, body)` — Bearer + JSON.
- `getTradepoints`, `getItems(priceTypeId?)`, `getCashboxes`, `getPaymentMethods`,
  `getUsersFront`, `getShifts`
- `getOpenShift(apiKey, tradepointId)` → id открытой смены или null
- `ensureShift(apiKey, integ)` → вернуть открытую или (если auto_open_shift) открыть
- `createOrder(apiKey, {shiftId, items:[{id,count,price}], ...})`
- `closeOrder(apiKey, orderId, {cashboxId, payments:[{method_id,sum}]})`
- `processRostaRedemption(supabase, {redemptionId, shopId, subscriptionTypeId})` —
  идемпотентно по redemption_id в `iiko_order_log`, provider='rosta':
  1. загрузить integ (is_active), map (товар+цена)
  2. `ensureShift` → shift_id
  3. `createOrder` → order id
  4. если auto_close → `closeOrder` (cashbox_id + payment_method_id + сумма)
  5. записать `pos_order_id`, статус
- `createRostaTestOrder(supabase, {shopId, subscriptionTypeId})` — is_test=true.

### `supabase/functions/rosta-connect/index.ts` (mirror poster-connect)
Действия (auth: партнёр этой кофейни/админ):
- `connect` — валидировать api_key через GET `/tradepoints`, upsert `rosta_integrations`.
- `tradepoints`, `items` (с price_type_id), `cashboxes`, `payment_methods`, `users`,
  `price_types` — списки для настройки кабинета.
- `test_order` → `createRostaTestOrder`.

### `supabase/functions/_shared/pos.ts` (диспетчер — расширить)
- `dispatchRedemptionOrder`: если `rosta_integrations.is_active` → `processRostaRedemption`;
  иначе poster; иначе iiko.
- `cancelPosOrder`: для `provider==='rosta'` → вернуть not-supported ошибку (см. §2.2).

## 5. Фронтенд

### `src/components/partner/PartnerRostaSection.tsx` (mirror PartnerPosterSection)
Все кнопки рабочие (без муляжей):
- Поле API-ключа + «Подключить» (`connect`).
- Селект торговой точки + «Загрузить» (`tradepoints`).
- Селект кассы (`cashboxes`, фильтр по точке) — для закрытия чека.
- Селект способа оплаты (`payment_methods`) — для закрытия чека.
- Селект сотрудника (`users`) — для открытия смены.
- (необяз.) Селект вида цены (`price_types`).
- Свитчи «Автозакрытие» и «Авто-открытие смены».
- «Загрузить меню» (`items`) + привязка тарифов → `rosta_menu_map` (цена в тенге, без /100).
- «Отправить тестовый заказ» (`test_order`).
- Свитч «Интеграция активна» → активация деактивирует iiko И poster.
- «Отключить» (delete).
- Журнал заказов: для Rosta кнопка «Отмена» **задизейблена** + подсказка
  «Rosta: отмена только вручную на кассе».

### `src/pages/partner/PartnerIntegrationPage.tsx`
- Провайдер-табы теперь 3: iiko / Poster / Rosta.
- Дефолт-провайдер = тот, у кого есть запись/активен.
- Активация любого провайдера деактивирует два других.
- Журнал iiko фильтруется `provider='iiko'` (уже сделано) — добавить фильтр для rosta-секции.

### `src/integrations/supabase/types.ts`
- Добавить типы `rosta_integrations` и `rosta_menu_map`.

## 6. Порядок реализации (когда скажут «го»)
1. Миграция `rosta_integrations` + `rosta_menu_map` (+ применить на self-hosted).
2. `_shared/rosta.ts`.
3. `rosta-connect/index.ts`.
4. Расширить `_shared/pos.ts` (dispatch + cancel).
5. `types.ts`.
6. `PartnerRostaSection.tsx`.
7. Встроить в `PartnerIntegrationPage.tsx` (3 таба, взаимное отключение).
8. Деплой edge (scp + docker restart), сборка/деплой web (tar dist → scp → /var/www/web),
   md5 сервер=git.
9. Тест реальным ключом партнёра: точки → касса → оплата → сотрудник → меню →
   привязка → тестовый заказ → проверить чек в Rosta. Проверить, что iiko/Poster целы.

## 7. Открытые вопросы к партнёру (уточнить перед реализацией)
- API-ключ Rosta партнёра (Bearer) — как у Poster, свой на кофейню.
- Держит ли партнёр смену открытой в рабочее время, или нужно авто-открытие
  (тогда обязателен выбор сотрудника front-офиса).
- Какой способ оплаты использовать для автозакрытия (нал/безнал/спец. «подписка»).
