-- ============================================================================
-- Закрываем утечку персональных данных.
--
-- Политика «Authenticated users can view profiles» с условием true давала
-- ЛЮБОМУ зарегистрированному пользователю читать все 481 профиль вместе с
-- телефонами (145 из них — настоящие номера). Вторая политика открывала все
-- профили ещё и партнёрам с бариста, хотя им нужны только свои сотрудники.
--
-- RLS работает построчно, а колонки скрыть не может. Поэтому:
--   • безопасные поля (имя, аватар, ник, public_id) выносим в отдельное
--     представление public_profiles — им пользуется лента SubFlow, истории
--     и партнёрская история;
--   • саму таблицу profiles закрываем: свой профиль, админ/модератор,
--     и партнёр — только сотрудники своей кофейни.
-- ============================================================================

-- 1. Публичные поля профиля — без телефона, города и служебных флагов --------
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT user_id, name, avatar_url, subflow_nickname, public_id
  FROM public.profiles;

REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Безопасная проекция profiles для соцфункций. Телефон, город, страна и служебные поля сюда НЕ входят.';

-- 2. Закрываем таблицу -------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Staff can view customer profiles" ON public.profiles;

CREATE POLICY "Own profile, admins, and own staff"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    -- Партнёр/бариста видят профили сотрудников СВОЕЙ кофейни (нужно списку персонала).
    OR (
      get_staff_shop_id(auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = profiles.user_id
           AND ur.shop_id = get_staff_shop_id(auth.uid())
      )
    )
  );

-- 3. Поиск сотрудника по коду ------------------------------------------------
-- Партнёр добавляет бариста по 6-значному public_id. Отдавать по нему телефон
-- нельзя: код короткий и перебирается, иначе получился бы способ выкачать
-- номера. Возвращаем имя и телефон в маскированном виде — этого достаточно,
-- чтобы убедиться, что найден нужный человек.
CREATE OR REPLACE FUNCTION public.find_user_by_public_id(_public_id text)
RETURNS TABLE(user_id uuid, name text, phone_masked text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR get_staff_shop_id(auth.uid()) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Недостаточно прав для поиска пользователя';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         p.name,
         CASE
           WHEN p.phone IS NULL THEN NULL
           WHEN p.phone LIKE '+telegram_%' THEN 'TG'
           WHEN length(p.phone) > 4 THEN '••• ' || right(p.phone, 4)
           ELSE '•••'
         END AS phone_masked
    FROM public.profiles p
   WHERE p.public_id = _public_id
   LIMIT 1;
END $fn$;

REVOKE ALL ON FUNCTION public.find_user_by_public_id(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_public_id(text) TO authenticated;
