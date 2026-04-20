-- ============================================
-- 1. PAYMENT_ORDERS: убрать опасную "Service role full access" с public
-- ============================================
DROP POLICY IF EXISTS "Service role full access" ON public.payment_orders;
-- Service role и так обходит RLS, отдельная политика не нужна.
-- Существующие политики "Users can view/create own" + "Admins can delete" остаются.

-- ============================================
-- 2. PROFILES: убрать утечку телефонов всем авторизованным
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
-- Политика "Staff can view customer profiles" остаётся (она и для самого user, и для staff).
-- Создаём safe view для публичных полей (без phone).

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT
  user_id,
  name,
  avatar_url,
  subflow_nickname,
  public_id,
  city,
  country,
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Дополнительная политика: разрешить SELECT публичных колонок всем авторизованным
-- через safe view (view с security_invoker=true проверяет RLS вызывающего).
-- Для этого нужна политика, разрешающая чтение строк, но колонки phone мы спрячем на уровне приложения.
-- Поскольку Postgres RLS работает на уровне строк, а не колонок, делаем:
-- разрешаем SELECT всем authenticated — но клиентский код должен использовать public_profiles view.
-- Для безопасности телефона создаём grants на колонки.

CREATE POLICY "Authenticated can view profile rows"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Отзываем доступ к колонке phone у обычных authenticated, оставляем только staff
REVOKE SELECT (phone) ON public.profiles FROM authenticated;
REVOKE SELECT (phone) ON public.profiles FROM anon;
-- Staff будут читать phone через service role или через get_user_phone функцию

-- Функция для staff: получить телефон по user_id (только staff)
CREATE OR REPLACE FUNCTION public.get_user_phone(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone FROM public.profiles
  WHERE user_id = _user_id
    AND (
      auth.uid() = _user_id
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
      OR public.has_role(auth.uid(), 'partner'::app_role)
      OR public.has_role(auth.uid(), 'barista'::app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_phone(uuid) TO authenticated;

-- ============================================
-- 3. USER_STATS: запретить клиентам прямые мутации
-- ============================================
-- Текущие политики дают пользователю полный CRUD на свою запись —
-- это позволяет накручивать coffee_remaining/bonus_points через DevTools.
-- Оставляем только SELECT, мутации — только через SECURITY DEFINER функции и service role.

DROP POLICY IF EXISTS "Users can update their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can insert their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can delete their own stats" ON public.user_stats;

-- Убедимся что SELECT остаётся
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_stats'
      AND policyname='Users can view their own stats'
  ) THEN
    CREATE POLICY "Users can view their own stats"
    ON public.user_stats
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END$$;

-- Админы могут управлять всем (для refresh лимитов и т.д.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_stats'
      AND policyname='Admins can manage user_stats'
  ) THEN
    CREATE POLICY "Admins can manage user_stats"
    ON public.user_stats
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END$$;

-- Staff могут видеть статистику клиентов (нужно для бариста при списании)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_stats'
      AND policyname='Staff can view customer stats'
  ) THEN
    CREATE POLICY "Staff can view customer stats"
    ON public.user_stats
    FOR SELECT
    USING (
      public.has_role(auth.uid(), 'partner'::app_role)
      OR public.has_role(auth.uid(), 'barista'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
    );
  END IF;
END$$;

-- Создаём SECURITY DEFINER функцию для инициализации user_stats (нужно из useUserStats.ts)
CREATE OR REPLACE FUNCTION public.ensure_user_stats(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  INSERT INTO public.user_stats (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_stats(uuid) TO authenticated;

-- ============================================
-- 4. WEBHOOK_LOGS: убрать публичный insert
-- ============================================
DROP POLICY IF EXISTS "Anyone can insert webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Public can insert webhook logs" ON public.webhook_logs;
-- Service role обходит RLS, поэтому freedompay-webhook продолжит работать.
-- Если других INSERT политик нет — клиентский insert будет невозможен (это и нужно).