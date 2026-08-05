-- Реальная push-аудитория для превью рассылки: пользователи с device-токеном.
-- device_tokens под RLS «только свои» (админ с клиента их не читает), поэтому
-- отдаём список user_id через SECURITY DEFINER RPC, доступный только админам/модераторам.
-- Токенов самих (секрет) не возвращаем — только user_id, чтобы посчитать/показать
-- реальный список получателей (не всю базу).

CREATE OR REPLACE FUNCTION public.get_push_reachable_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT dt.user_id
  FROM public.device_tokens dt
  WHERE public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator');
$$;

REVOKE ALL ON FUNCTION public.get_push_reachable_user_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_push_reachable_user_ids() TO authenticated;
