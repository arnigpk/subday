-- ============================================================================
-- БЕЗОПАСНОСТЬ: закрываем прямой вызов чувствительных RPC с клиента.
-- Найдено аудитом (проверено эксплуатацией на тестовых данных с откатом):
--
-- 1) grant_guest_access — 🔴 КРИТИЧНО. Принимает _inviter_id ПАРАМЕТРОМ, а не из
--    auth.uid(), и была доступна anon/authenticated. Любой пользователь мог указать
--    ЧУЖОЙ аккаунт дарителем и списать с него кофе себе (подтверждено: баланс
--    жертвы 15 → 13). Легитимный вызов — только edge-функция guest-access
--    (service_role), которая сама проверяет, что даритель = вызывающий.
-- 2) claim_pending_guest_access — та же схема (_invitee_id параметром); вызывается
--    только из guest-access.
-- 3) expire_subscriptions — массовая деактивация; вызывается только кроном через
--    edge expire-subscriptions. С клиента — бесполезная тяжёлая нагрузка (DoS-вектор).
-- 4) get_admin_dashboard_stats — отдавала анониму бизнес-метрики (регистрации/входы
--    за день и неделю). Вызывается из админки залогиненным админом.
--
-- Подход с минимальным риском: для (1)-(3) НЕ трогаем тело функций — только
-- отзываем EXECUTE у anon/authenticated. service_role (эдж-функции) сохраняет
-- доступ, поэтому легитимные пути работают как раньше.
-- Для (4) добавляем проверку роли внутрь (клиент вызывает под JWT админа).
--
-- Триггерные функции (bump_banner_counters, bump_subflow_ad_counters,
-- cleanup_post_notifications, set_preorder_subscription_snapshot) не трогаем —
-- как RPC они неосмысленны и вреда не несут.
-- ============================================================================

-- 1-3. Только сервисные вызовы (эдж-функции под service_role).
--
-- ВНИМАНИЕ: grant_guest_access принадлежит роли supabase_admin, а не postgres.
-- REVOKE от невладельца Postgres выполняет МОЛЧА без эффекта (проверено: ACL
-- не менялся, дыра оставалась). Поэтому для неё REVOKE выполняется от владельца:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres
-- Ниже DO-блок делает это же безопасно: пробует отозвать и сообщает результат,
-- чтобы применение миграции на другой инсталляции не прошло «вхолостую».
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.grant_guest_access(uuid, uuid, date, timestamptz, uuid, integer) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.grant_guest_access(uuid, uuid, date, timestamptz, uuid, integer) TO service_role';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'grant_guest_access: нет прав отозвать (владелец supabase_admin) — выполните тот же REVOKE под supabase_admin';
END $$;

-- Проверка результата: если PUBLIC/anon всё ещё имеют EXECUTE — миграция должна
-- об этом громко сказать, а не притвориться успешной.
DO $$
DECLARE v_acl text;
BEGIN
  SELECT array_to_string(p.proacl, ',') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'grant_guest_access';
  IF v_acl LIKE '%anon=X%' OR v_acl LIKE '%authenticated=X%' OR v_acl LIKE '%=X/supabase_admin,%' THEN
    RAISE WARNING 'grant_guest_access ВСЁ ЕЩЁ доступна клиенту! ACL=%', v_acl;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_pending_guest_access(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_pending_guest_access(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO service_role;

-- 4. Дашборд: тело сохранено 1-в-1, добавлена только проверка прав в начале.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  today_date date := current_date;
  week_ago date := current_date - interval '7 days';
  today_registered bigint;
  today_logins bigint;
  week_registered bigint;
  week_logins bigint;
BEGIN
  -- Доступ: платформенный админ (админка) или сервисный вызов. Аноним/обычный
  -- пользователь бизнес-метрики не получает.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  -- Today registrations
  SELECT count(*) INTO today_registered
  FROM auth.users
  WHERE created_at::date = today_date;

  -- Today logins (users who signed in today)
  SELECT count(*) INTO today_logins
  FROM auth.users
  WHERE last_sign_in_at::date = today_date;

  -- Week registrations
  SELECT count(*) INTO week_registered
  FROM auth.users
  WHERE created_at::date >= week_ago;

  -- Week logins
  SELECT count(*) INTO week_logins
  FROM auth.users
  WHERE last_sign_in_at::date >= week_ago;

  RETURN json_build_object(
    'today_registered', today_registered,
    'today_logins', today_logins,
    'week_registered', week_registered,
    'week_logins', week_logins
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated, service_role;
