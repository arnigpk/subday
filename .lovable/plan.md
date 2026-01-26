

# Подготовка к созданию subday-admin

## Обзор

Подготовим базу данных для админ-дашборда, добавив систему ролей и обновив RLS политики. После этого ты создашь новый проект в Lovable.

## Шаг 1: Изменения в базе данных (текущий проект)

### Новые объекты:

**1. Enum для ролей**
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'partner');
```

**2. Таблица user_roles**
- `user_id` — ссылка на пользователя
- `role` — роль (admin/moderator/partner)
- `shop_id` — для партнёров: привязка к конкретной кофейне

**3. Функции безопасности**
- `has_role(user_id, role)` — проверка наличия роли
- `get_partner_shop_id(user_id)` — получение shop_id партнёра

**4. RLS политики**
- Админы и модераторы видят все профили и redemptions
- Партнёры видят только redemptions своей кофейни

### Обновление существующих политик:

| Таблица | Новая политика |
|---------|----------------|
| profiles | Админы/модераторы видят всех |
| user_stats | Админы/модераторы видят всех |
| redemptions | Админы/модераторы видят все, партнёры — только свою кофейню |

## Шаг 2: Назначение админа

После миграции добавлю твой аккаунт как админа. Для этого мне нужен твой `user_id` из текущей авторизации, или ты сможешь добавить его вручную.

## Шаг 3: Создание нового проекта (твои действия)

1. Открой https://lovable.dev
2. Нажми "New Project"
3. Назови его `subday-admin`
4. После создания — напиши мне, я помогу подключить к существующей базе

## Шаг 4: Что будет в subday-admin

### Страницы:
- `/` — Дашборд с метриками
- `/users` — Таблица пользователей с поиском и фильтрами
- `/history` — Все redemptions с фильтрами
- `/shops` — Статистика по кофейням
- `/settings` — Управление ролями

### Функциональность по ролям:

| Функция | Admin | Moderator | Partner |
|---------|-------|-----------|---------|
| Все метрики | да | да | нет |
| Все пользователи | да | да | нет |
| Все redemptions | да | да | нет |
| Своя кофейня | да | да | да |
| Изменение баланса | да | да | нет |
| Управление ролями | да | нет | нет |

### Технологии:
- React + TypeScript + Tailwind (как в subday)
- shadcn/ui компоненты
- Recharts для графиков
- TanStack Table для таблиц

## Техническая секция

### SQL миграция для текущего проекта:

```sql
-- 1. Enum для ролей
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'partner');

-- 2. Таблица ролей
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  shop_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. RLS для user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Функция проверки роли (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Функция получения shop_id партнёра
CREATE OR REPLACE FUNCTION public.get_partner_shop_id(_user_id UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT shop_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'partner'
  LIMIT 1
$$;

-- 6. Политика: только админы видят таблицу ролей
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Обновление политик для profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Обновление политик для user_stats
CREATE POLICY "Admins can view all stats"
ON public.user_stats FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can update any stats"
ON public.user_stats FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. Обновление политик для redemptions
CREATE POLICY "Admins can view all redemptions"
ON public.redemptions FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'moderator') OR
  (public.has_role(auth.uid(), 'partner') AND shop_id = public.get_partner_shop_id(auth.uid()))
);
```

### Подключение нового проекта к базе:

В новом проекте нужно будет:
1. Зайти в Settings проекта
2. Выбрать "Connectors" → "Supabase"
3. Ввести данные текущего проекта:
   - URL: из переменной VITE_SUPABASE_URL
   - Anon Key: из переменной VITE_SUPABASE_PUBLISHABLE_KEY

## Порядок действий

1. **Сейчас** — Я применю миграцию базы данных
2. **После миграции** — Ты скажешь мне свой user_id или email для назначения админом
3. **Потом** — Ты создашь новый проект в Lovable
4. **Далее** — Я реализую UI дашборда в новом проекте

