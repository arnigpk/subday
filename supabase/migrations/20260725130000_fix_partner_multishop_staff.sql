-- ============================================================================
-- Исправление: у владельца нескольких кофеен пропали имена сотрудников.
--
-- Политика сверялась с get_staff_shop_id() — она возвращает ОДНУ кофейню
-- (LIMIT 1). У владельца Coff таких кофеен 16, и при переключении на любую,
-- кроме первой, профили персонала переставали быть видны: список показывал
-- «Без имени / Неизвестно», и понять, кого удалять при увольнении, было
-- невозможно.
--
-- Берём get_staff_shop_ids() — она возвращает ВСЕ кофейни пользователя и уже
-- используется в политиках баннеров и SubFlow-рекламы.
-- ============================================================================

DROP POLICY IF EXISTS "Own profile, admins, and own staff" ON public.profiles;

CREATE POLICY "Own profile, admins, and own staff"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    -- Партнёр/бариста видят профили сотрудников ЛЮБОЙ своей кофейни.
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = profiles.user_id
         AND ur.shop_id = ANY (ARRAY(SELECT public.get_staff_shop_ids(auth.uid())))
    )
  );

-- Поиск бариста по коду — тот же принцип: доступ есть у любого сотрудника
-- хотя бы одной кофейни, а не только «первой».
CREATE OR REPLACE FUNCTION public.find_user_by_public_id(_public_id text)
RETURNS TABLE(user_id uuid, name text, phone_masked text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (SELECT 1 FROM public.get_staff_shop_ids(auth.uid()))
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
