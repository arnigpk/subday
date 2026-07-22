-- Поиск сотрудника для выдачи места B2B: по 6-значному коду (public_id) или
-- по телефону. Доступ — админ бизнеса (b2b_admin) или платформенный админ.
-- Телефон отдаём маской: код перебираем, полный номер светить незачем.
CREATE OR REPLACE FUNCTION public.b2b_find_employee(p_query text)
RETURNS TABLE(user_id uuid, name text, phone_masked text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_q text := trim(p_query);
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'b2b_admin'::app_role)) THEN
    RAISE EXCEPTION 'Недостаточно прав для поиска сотрудника';
  END IF;
  IF v_q = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.user_id, p.name,
         CASE WHEN p.phone IS NULL THEN NULL
              WHEN p.phone LIKE '+telegram_%' THEN 'TG'
              WHEN length(p.phone) > 4 THEN '••• ' || right(p.phone, 4)
              ELSE '•••' END AS phone_masked
    FROM public.profiles p
   WHERE p.public_id = v_q
      OR p.phone = v_q
      OR p.phone = '+' || regexp_replace(v_q, '\D', '', 'g')
   LIMIT 1;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_find_employee(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_find_employee(text) TO authenticated;
