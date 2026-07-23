-- ============================================================================
-- 1) БЕЗОПАСНОСТЬ: activate_subscription была SECURITY DEFINER без проверки
--    ролей и с EXECUTE у anon/authenticated — любой пользователь мог активировать
--    себе любой тариф бесплатно прямым вызовом RPC. Закрываем:
--      • изнутри пускаем только сервисные вызовы (webhooks/эдж-функции работают
--        под service_role; внутренние SECURITY DEFINER RPC — под postgres)
--        и платформенных админов (has_role 'admin');
--      • EXECUTE отзываем у anon и PUBLIC.
-- 2) УЧЁТ ИСТОЧНИКА: user_subscriptions.source — кто породил подписку:
--    'purchase' | 'purchase_special' | 'admin' | 'b2b' | 'signup'.
--    Параметр _source опциональный: старые вызовы работают без изменений.
--    Бэкфилл: B2B-подписки помечаем по связи b2b_seats.subscription_id.
-- ============================================================================

ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS source text;

-- Меняется сигнатура (добавился параметр) — старую функцию убираем, иначе
-- останутся две перегрузки и двухаргументные вызовы пойдут в старую дырявую.
DROP FUNCTION IF EXISTS public.activate_subscription(uuid, uuid);

CREATE OR REPLACE FUNCTION public.activate_subscription(
  _user_id uuid,
  _subscription_type_id uuid,
  _source text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  sub_type RECORD;
  new_sub_id uuid;
  calculated_duration integer;
BEGIN
  -- Доступ. ВАЖНО: current_user внутри SECURITY DEFINER — всегда владелец,
  -- для проверки вызывающего он бесполезен. Поэтому:
  --   • auth.role() читает роль из JWT запроса (эдж-функции ходят с service key);
  --   • доверенные внутренние RPC (b2b_assign_seat) выставляют транзакционный
  --     флаг subday.internal — через PostgREST клиент set_config недоступен;
  --   • платформенный админ — по has_role.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(current_setting('subday.internal', true), '') <> '1'
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав для активации подписки';
  END IF;

  SELECT * INTO sub_type
  FROM subscription_types
  WHERE id = _subscription_type_id AND is_active = true;

  IF sub_type IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subscription type not found');
  END IF;

  calculated_duration := sub_type.duration_days;

  -- Deactivate existing active subscriptions of the same type only
  UPDATE user_subscriptions SET is_active = false
  WHERE user_id = _user_id AND is_active = true
    AND subscription_type_id IN (
      SELECT id FROM subscription_types WHERE type = sub_type.type
    );

  -- daily_limit_reset_at = now() — дневной лимит стартует заново.
  INSERT INTO user_subscriptions (user_id, subscription_type_id, started_at, expires_at, is_active, daily_limit_reset_at, source)
  VALUES (_user_id, _subscription_type_id, now(), now() + (calculated_duration || ' days')::interval, true, now(), _source)
  RETURNING id INTO new_sub_id;

  IF sub_type.type = 'coffee' THEN
    UPDATE user_stats SET coffee_remaining = sub_type.cups_count, coffee_total = sub_type.cups_count, updated_at = now()
    WHERE user_id = _user_id;
    IF NOT FOUND THEN
      INSERT INTO user_stats (user_id, coffee_remaining, coffee_total) VALUES (_user_id, sub_type.cups_count, sub_type.cups_count);
    END IF;
  ELSIF sub_type.type = 'drinks' THEN
    UPDATE user_stats SET drinks_remaining = sub_type.cups_count, drinks_total = sub_type.cups_count, updated_at = now()
    WHERE user_id = _user_id;
    IF NOT FOUND THEN
      INSERT INTO user_stats (user_id, drinks_remaining, drinks_total) VALUES (_user_id, sub_type.cups_count, sub_type.cups_count);
    END IF;
  END IF;

  -- Сбрасываем дедуп уведомлений (низкий баланс / скоро истекает) для этого юзера.
  DELETE FROM notification_dedupe_log
  WHERE user_id = _user_id
    AND (alert_key LIKE 'low_balance_%' OR alert_key LIKE 'expiring_soon_%');

  RETURN json_build_object(
    'success', true, 'subscription_id', new_sub_id,
    'expires_at', now() + (calculated_duration || ' days')::interval,
    'cups_count', sub_type.cups_count, 'duration_days', calculated_duration,
    'subscription_name', sub_type.name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_subscription(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, uuid, text) TO authenticated, service_role;

-- B2B-выдачи теперь помечают источник: единственное изменение в b2b_assign_seat —
-- вызов activate_subscription(..., 'b2b'); остальное тело как в 20260730090000.
CREATE OR REPLACE FUNCTION public.b2b_assign_seat(p_allocation_id uuid, p_employee_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_alloc     public.b2b_allocations;
  v_used      int;
  v_sub_id    uuid;
  v_seat_id   uuid;
  v_tier_name text;
BEGIN
  SELECT * INTO v_alloc FROM public.b2b_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF v_alloc.id IS NULL THEN
    RAISE EXCEPTION 'Пул не найден';
  END IF;

  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (SELECT 1 FROM public.b2b_accounts a
                      WHERE a.id = v_alloc.account_id AND a.admin_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  IF v_alloc.expires_at IS NOT NULL AND v_alloc.expires_at < now() THEN
    RAISE EXCEPTION 'Срок действия пула истёк';
  END IF;

  IF EXISTS (SELECT 1 FROM public.b2b_seats
              WHERE allocation_id = p_allocation_id AND employee_user_id = p_employee_user_id
                AND status = 'active') THEN
    RAISE EXCEPTION 'Этому сотруднику место уже выдано';
  END IF;

  -- Занятые слоты = активные + потраченные (revoked с consumed_slot).
  SELECT count(*) INTO v_used FROM public.b2b_seats
   WHERE allocation_id = p_allocation_id AND (status = 'active' OR consumed_slot);
  IF v_used >= v_alloc.seats_total THEN
    RAISE EXCEPTION 'Свободных мест нет (% из %)', v_used, v_alloc.seats_total;
  END IF;

  -- Флаг доверенного внутреннего вызова (см. activate_subscription); снимаем сразу после.
  PERFORM set_config('subday.internal', '1', true);
  PERFORM public.activate_subscription(p_employee_user_id, v_alloc.subscription_type_id, 'b2b');
  PERFORM set_config('subday.internal', '', true);
  SELECT id INTO v_sub_id FROM public.user_subscriptions
   WHERE user_id = p_employee_user_id AND subscription_type_id = v_alloc.subscription_type_id
     AND is_active ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.b2b_seats (account_id, allocation_id, employee_user_id, subscription_id, status)
  VALUES (v_alloc.account_id, p_allocation_id, p_employee_user_id, v_sub_id, 'active')
  RETURNING id INTO v_seat_id;

  -- Уведомляем сотрудника об активации (Telegram + push + in-app через воркер).
  SELECT name INTO v_tier_name FROM public.subscription_types WHERE id = v_alloc.subscription_type_id;
  INSERT INTO public.broadcast_queue (channel, target, user_id, status, payload)
  VALUES ('notify', p_employee_user_id::text, p_employee_user_id, 'pending',
          jsonb_build_object('type', 'activated', 'userId', p_employee_user_id,
                             'subscriptionName', COALESCE(v_tier_name, 'Подписка')));

  RETURN jsonb_build_object('ok', true, 'seat_id', v_seat_id, 'used', v_used + 1, 'total', v_alloc.seats_total);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_assign_seat(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_assign_seat(uuid, uuid) TO authenticated;

-- Бэкфилл: все подписки, выданные через B2B-места, получают source='b2b'.
UPDATE public.user_subscriptions us SET source = 'b2b'
  FROM public.b2b_seats s
 WHERE s.subscription_id = us.id AND us.source IS NULL;
