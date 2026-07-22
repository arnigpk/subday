-- ============================================================================
-- B2B: при выдаче места сотрудник должен получить уведомление об активации
-- подписки — так же, как при обычной активации. Ставим задачу в broadcast_queue
-- (channel='notify'); broadcast-worker дренит её и вызывает
-- send-subscription-notification с type='activated'. Всё остальное в функции
-- без изменений — только добавлен блок постановки уведомления в очередь.
-- ============================================================================

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
  -- Блокируем строку пула — сериализуем конкурентные выдачи, чтобы не выдать
  -- больше мест, чем есть.
  SELECT * INTO v_alloc FROM public.b2b_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF v_alloc.id IS NULL THEN
    RAISE EXCEPTION 'Пул не найден';
  END IF;

  -- Права: платформенный админ или админ этого бизнес-аккаунта.
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (SELECT 1 FROM public.b2b_accounts a
                      WHERE a.id = v_alloc.account_id AND a.admin_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  IF v_alloc.expires_at IS NOT NULL AND v_alloc.expires_at < now() THEN
    RAISE EXCEPTION 'Срок действия пула истёк';
  END IF;

  -- Уже есть активное место у этого сотрудника в этом пуле?
  IF EXISTS (SELECT 1 FROM public.b2b_seats
              WHERE allocation_id = p_allocation_id AND employee_user_id = p_employee_user_id
                AND status = 'active') THEN
    RAISE EXCEPTION 'Этому сотруднику место уже выдано';
  END IF;

  SELECT count(*) INTO v_used FROM public.b2b_seats
   WHERE allocation_id = p_allocation_id AND status = 'active';
  IF v_used >= v_alloc.seats_total THEN
    RAISE EXCEPTION 'Свободных мест нет (% из %)', v_used, v_alloc.seats_total;
  END IF;

  -- Выдаём подписку сотруднику и запоминаем её id.
  PERFORM public.activate_subscription(p_employee_user_id, v_alloc.subscription_type_id);
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
          jsonb_build_object(
            'type', 'activated',
            'userId', p_employee_user_id,
            'subscriptionName', COALESCE(v_tier_name, 'Подписка')
          ));

  RETURN jsonb_build_object('ok', true, 'seat_id', v_seat_id, 'used', v_used + 1, 'total', v_alloc.seats_total);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_assign_seat(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_assign_seat(uuid, uuid) TO authenticated;
