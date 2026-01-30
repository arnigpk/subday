
# План создания партнёрского дашборда

## Обзор задачи

Создаём отдельную панель управления для партнёров (владельцев кофеен) по адресу `/partner`. Партнёр сможет:
- Видеть статистику своей кофейни
- Сканировать QR-коды клиентов для списания напитков
- Просматривать историю покупок только своей кофейни
- Управлять баристами (добавлять сотрудников с правами на сканирование)

## Ключевые требования безопасности

1. **Изоляция данных**: Партнёр видит только данные своей кофейни (привязка через `shop_id` в `user_roles`)
2. **Валидация QR**: При сканировании проверяется, что `shopId` в QR совпадает с `shop_id` партнёра
3. **Роль баристы**: Новая роль `barista` с минимальными правами (только сканирование)

## Структура изменений

### Часть 1: База данных

**Добавление роли `barista`**

```sql
-- Расширяем enum app_role
ALTER TYPE app_role ADD VALUE 'barista';

-- Обновляем RLS политики для redemptions
-- Бариста могут вставлять redemptions для своего shop_id
CREATE POLICY "Baristas can insert redemptions for their shop" ON redemptions
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'barista') AND 
    shop_id = get_partner_shop_id(auth.uid())
  );
```

### Часть 2: Edge Function для сканирования QR

Создаём `partner-scan-qr` функцию которая:
- Принимает данные из отсканированного QR
- Валидирует принадлежность QR к нужной кофейне
- Проверяет баланс пользователя
- Выполняет списание напитка
- Создаёт запись в `redemptions`

```text
Поток работы:
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Сканер     │────>│ partner-scan-qr  │────>│  Database   │
│  (камера)   │     │  Edge Function   │     │ (RLS check) │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    Проверки:
                    • shopId совпадает?
                    • Баланс > 0?
                    • QR не просрочен?
```

### Часть 3: Компоненты партнёрского кабинета

**Структура файлов:**

```
src/
├── components/
│   └── partner/
│       ├── PartnerLayout.tsx      # Обёртка с навигацией
│       ├── PartnerProtectedRoute.tsx  # Защита роутов
│       └── QRScanner.tsx          # Компонент сканера
├── pages/
│   └── partner/
│       ├── PartnerDashboard.tsx   # Главная со статистикой
│       ├── PartnerScanPage.tsx    # Страница сканирования
│       ├── PartnerHistoryPage.tsx # История покупок
│       └── PartnerStaffPage.tsx   # Управление баристами
└── hooks/
    └── usePartnerAuth.ts          # Хук для partner/barista
```

### Часть 4: Детали реализации

#### 4.1 PartnerDashboard (Статистика)

| Метрика | Описание |
|---------|----------|
| Сегодня | Количество redemptions за текущий день |
| За неделю | Redemptions за последние 7 дней |
| Популярный напиток | Самый частый drink_name |
| Часы пик | Время наибольшей активности |

#### 4.2 QR Сканер

- Используем библиотеку `html5-qrcode` для работы с камерой
- Парсим JSON из QR и валидируем структуру
- Отправляем данные в Edge Function
- Показываем результат (успех/ошибка)

**Валидация QR:**
```text
1. Проверить type === 'subday_redeem'
2. Проверить shopId === partner.shopId
3. Проверить timestamp < 5 минут назад
4. Вызвать Edge Function для списания
```

#### 4.3 История покупок

Отображает таблицу с полями:
- **Имя клиента** (из profiles по user_id)
- **Время** (redeemed_at)
- **Напиток** (drink_name)

Фильтрация автоматически по `shop_id` партнёра через RLS.

#### 4.4 Управление баристами

- Поиск пользователя по телефону
- Назначение роли `barista` с привязкой к shop_id
- Список текущих бариста с возможностью удаления
- Бариста получают доступ только к странице сканирования

### Часть 5: Навигация и роутинг

**Новые маршруты в App.tsx:**

```text
/partner           → PartnerDashboard (partner, barista)
/partner/scan      → PartnerScanPage (partner, barista)  
/partner/history   → PartnerHistoryPage (partner only)
/partner/staff     → PartnerStaffPage (partner only)
```

**Меню для партнёра:**
- Дашборд
- Сканер QR
- История
- Сотрудники

**Меню для баристы:**
- Сканер QR (единственный пункт)

## Технические детали

### Зависимости

```json
{
  "html5-qrcode": "^2.3.8"
}
```

### RLS политики

```sql
-- Партнёры и бариста могут видеть redemptions своей кофейни
-- (уже есть в текущей политике через get_partner_shop_id)

-- Новая функция для получения shop_id бариста
CREATE OR REPLACE FUNCTION public.get_barista_shop_id(_user_id uuid)
RETURNS text AS $$
  SELECT shop_id FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('partner', 'barista')
  LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Обработка ошибок сканирования

| Код ошибки | Сообщение пользователю |
|------------|------------------------|
| WRONG_SHOP | "Этот QR принадлежит другой кофейне" |
| NO_BALANCE | "У клиента закончились напитки" |
| EXPIRED_QR | "QR-код просрочен, попросите обновить" |
| INVALID_QR | "Неверный формат QR-кода" |
| ALREADY_USED | "Этот QR уже был использован" |

## Порядок реализации

1. **Миграция БД**: Добавить роль `barista`, обновить RLS
2. **Edge Function**: Создать `partner-scan-qr`
3. **Хук авторизации**: `usePartnerAuth.ts`
4. **Layout и защита**: `PartnerLayout.tsx`, `PartnerProtectedRoute.tsx`
5. **Страницы**: Dashboard → Scan → History → Staff
6. **Роутинг**: Добавить маршруты в App.tsx
7. **Тестирование**: Проверить изоляцию данных между кофейнями
