-- ============================================================================
-- B2B: правильный учёт пула при отзыве места.
-- Правило: если сотрудник по выданной подписке сделал хотя бы одно списание —
-- место считается ПОТРАЧЕННЫМ и в пул НЕ возвращается. Если ни одного списания
-- не было — место возвращается в пул (бизнес ничего не потерял).
--
-- Реализация: b2b_seats.consumed_slot. Место занимает слот пула, если оно
-- active ИЛИ (revoked И consumed_slot). «Использовал» = есть redemption того же
-- типа (coffee/drinks), сделанный не раньше выдачи места (assigned_at).
-- ============================================================================

ALTER TABLE public.b2b_seats ADD COLUMN IF NOT EXISTS consumed_slot boolean NOT NULL DEFAULT false;

-- Индекс для быстрого подсчёта занятых слотов (active или потраченных).
CREATE INDEX IF NOT EXISTS idx_b2b_seats_slot_used
  ON public.b2b_seats (allocation_id) WHERE status = 'active' OR consumed_slot;

-- ── Отзыв места: решаем, возвращать ли слот ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_revoke_seat(p_seat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_seat public.b2b_seats;
  v_type text;
  v_used boolean;
BEGIN
  SELECT * INTO v_seat FROM public.b2b_seats WHERE id = p_seat_id FOR UPDATE;
  IF v_seat.id IS NULL THEN
    RAISE EXCEPTION 'Место не найдено';
  END IF;
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (SELECT 1 FROM public.b2b_accounts a
                      WHERE a.id = v_seat.account_id AND a.admin_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF v_seat.status <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Тип напитка выданного тарифа (coffee/drinks).
  SELECT st.type INTO v_type
    FROM public.b2b_allocations al JOIN public.subscription_types st ON st.id = al.subscription_type_id
   WHERE al.id = v_seat.allocation_id;

  -- Использовал ли сотрудник хоть одно списание по этой выдаче?
  v_used := EXISTS (
    SELECT 1 FROM public.redemptions r
     WHERE r.user_id = v_seat.employee_user_id
       AND (v_type IS NULL OR r.drink_type = v_type)
       AND r.redeemed_at >= v_seat.assigned_at
  );

  -- Деактивируем именно ту подписку, что выдали.
  IF v_seat.subscription_id IS NOT NULL THEN
    UPDATE public.user_subscriptions SET is_active = false WHERE id = v_seat.subscription_id;
  END IF;

  -- consumed_slot = true → слот потрачен, в пул не возвращается.
  UPDATE public.b2b_seats
     SET status = 'revoked', revoked_at = now(), consumed_slot = v_used
   WHERE id = p_seat_id;

  RETURN jsonb_build_object('ok', true, 'consumed', v_used);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_revoke_seat(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_revoke_seat(uuid) TO authenticated;

-- ── Выдача места: занятость считаем как active ИЛИ потраченные ───────────────
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
          jsonb_build_object('type', 'activated', 'userId', p_employee_user_id,
                             'subscriptionName', COALESCE(v_tier_name, 'Подписка')));

  RETURN jsonb_build_object('ok', true, 'seat_id', v_seat_id, 'used', v_used + 1, 'total', v_alloc.seats_total);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_assign_seat(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_assign_seat(uuid, uuid) TO authenticated;

-- ── Обзор кабинета: занятость учитывает потраченные, + список потраченных ────
CREATE OR REPLACE FUNCTION public.b2b_get_overview()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_account public.b2b_accounts;
  v_result  jsonb;
BEGIN
  SELECT * INTO v_account FROM public.b2b_accounts WHERE admin_user_id = auth.uid() AND is_active LIMIT 1;
  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_account');
  END IF;

  WITH team AS (
    SELECT DISTINCT employee_user_id AS uid
      FROM public.b2b_seats WHERE account_id = v_account.id AND status = 'active'
  )
  SELECT jsonb_build_object(
    'ok', true,
    'account', jsonb_build_object('id', v_account.id, 'name', v_account.name),
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', al.id,
        'tier', st.name,
        'subscription_type_id', al.subscription_type_id,
        'seats_total', al.seats_total,
        'seats_used', COALESCE(u.used, 0),
        'seats_free', al.seats_total - COALESCE(u.used, 0),
        'expires_at', al.expires_at
      ) ORDER BY st.name)
      FROM public.b2b_allocations al
      JOIN public.subscription_types st ON st.id = al.subscription_type_id
      LEFT JOIN (
        SELECT allocation_id, count(*) used FROM public.b2b_seats
         WHERE status='active' OR consumed_slot GROUP BY 1
      ) u ON u.allocation_id = al.id
      WHERE al.account_id = v_account.id
    ), '[]'::jsonb),
    'seats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'seat_id', s.id,
        'allocation_id', s.allocation_id,
        'tier', st.name,
        'employee_user_id', s.employee_user_id,
        'name', p.name,
        'assigned_at', s.assigned_at,
        'redemptions', COALESCE(r.cnt, 0),
        'redemptions_30d', COALESCE(r.cnt30, 0),
        'last_visit', r.last_at
      ) ORDER BY COALESCE(r.cnt30, 0) DESC, s.assigned_at DESC)
      FROM public.b2b_seats s
      JOIN public.b2b_allocations al ON al.id = s.allocation_id
      JOIN public.subscription_types st ON st.id = al.subscription_type_id
      LEFT JOIN public.profiles p ON p.user_id = s.employee_user_id
      LEFT JOIN (
        SELECT user_id, count(*) cnt,
               count(*) FILTER (WHERE redeemed_at >= now() - interval '30 days') cnt30,
               max(redeemed_at) last_at
          FROM public.redemptions GROUP BY 1
      ) r ON r.user_id = s.employee_user_id
      WHERE s.account_id = v_account.id AND s.status = 'active'
    ), '[]'::jsonb),
    -- Потраченные места: отозваны, но слот пула израсходован (было списание).
    'consumed_seats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'seat_id', s.id, 'tier', st.name, 'name', p.name,
        'redemptions', COALESCE(r.cnt, 0), 'revoked_at', s.revoked_at
      ) ORDER BY s.revoked_at DESC)
      FROM public.b2b_seats s
      JOIN public.b2b_allocations al ON al.id = s.allocation_id
      JOIN public.subscription_types st ON st.id = al.subscription_type_id
      LEFT JOIN public.profiles p ON p.user_id = s.employee_user_id
      LEFT JOIN (SELECT user_id, count(*) cnt FROM public.redemptions GROUP BY 1) r ON r.user_id = s.employee_user_id
      WHERE s.account_id = v_account.id AND s.status = 'revoked' AND s.consumed_slot
    ), '[]'::jsonb),
    'stats', (
      SELECT jsonb_build_object(
        'active_seats', count(*) FILTER (WHERE s.status='active'),
        'employees_used', count(DISTINCT s.employee_user_id) FILTER (
          WHERE s.status='active' AND EXISTS (SELECT 1 FROM public.redemptions r WHERE r.user_id = s.employee_user_id)),
        'total_redemptions', COALESCE(sum(rr.cnt) FILTER (WHERE s.status='active'), 0)
      )
      FROM public.b2b_seats s
      LEFT JOIN (SELECT user_id, count(*) cnt FROM public.redemptions GROUP BY 1) rr ON rr.user_id = s.employee_user_id
      WHERE s.account_id = v_account.id
    ),
    'report', jsonb_build_object(
      'visits_30d', (
        SELECT count(*) FROM public.redemptions r
         WHERE r.user_id IN (SELECT uid FROM team)
           AND r.redeemed_at >= now() - interval '30 days'
      ),
      'adoption_pct', (
        SELECT CASE WHEN count(*) = 0 THEN 0
                    ELSE round(100.0 * count(*) FILTER (
                      WHERE EXISTS (SELECT 1 FROM public.redemptions r
                                     WHERE r.user_id = t.uid
                                       AND r.redeemed_at >= now() - interval '30 days')) / count(*))
               END
        FROM team t
      ),
      'monthly', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', to_char(m, 'Mon'), 'c', COALESCE(x.c, 0)) ORDER BY m)
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS g(m)
        LEFT JOIN (
          SELECT date_trunc('month', redeemed_at) AS mm, count(*) c
            FROM public.redemptions
           WHERE user_id IN (SELECT uid FROM team)
             AND redeemed_at >= date_trunc('month', now()) - interval '5 months'
           GROUP BY 1
        ) x ON x.mm = g.m
      ), '[]'::jsonb)
    )
  ) INTO v_result;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_get_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_get_overview() TO authenticated;

-- ── Админ-обзор: занятость учитывает потраченные, + потраченные места ────────
CREATE OR REPLACE FUNCTION public.b2b_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  SELECT COALESCE(jsonb_agg(acc ORDER BY acc->>'created_at' DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'contact_name', a.contact_name,
      'contact_phone', a.contact_phone,
      'admin_user_id', a.admin_user_id,
      'owner_name', o.name,
      'owner_public_id', o.public_id,
      'is_active', a.is_active,
      'created_at', a.created_at,
      'seats_total', COALESCE((SELECT sum(seats_total) FROM public.b2b_allocations WHERE account_id = a.id), 0),
      'seats_used', COALESCE((SELECT count(*) FROM public.b2b_seats WHERE account_id = a.id AND (status='active' OR consumed_slot)), 0),
      'allocations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', al.id, 'tier', st.name, 'seats_total', al.seats_total,
          'seats_used', COALESCE((SELECT count(*) FROM public.b2b_seats WHERE allocation_id = al.id AND (status='active' OR consumed_slot)), 0),
          'expires_at', al.expires_at
        ) ORDER BY st.name)
        FROM public.b2b_allocations al JOIN public.subscription_types st ON st.id = al.subscription_type_id
        WHERE al.account_id = a.id
      ), '[]'::jsonb),
      'seats', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'seat_id', s.id, 'tier', st.name, 'name', p.name, 'public_id', p.public_id,
          'assigned_at', s.assigned_at,
          'redemptions', COALESCE((SELECT count(*) FROM public.redemptions r WHERE r.user_id = s.employee_user_id), 0)
        ) ORDER BY s.assigned_at DESC)
        FROM public.b2b_seats s
        JOIN public.b2b_allocations al ON al.id = s.allocation_id
        JOIN public.subscription_types st ON st.id = al.subscription_type_id
        LEFT JOIN public.profiles p ON p.user_id = s.employee_user_id
        WHERE s.account_id = a.id AND s.status='active'
      ), '[]'::jsonb),
      'consumed_seats', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'seat_id', s.id, 'tier', st.name, 'name', p.name, 'public_id', p.public_id,
          'revoked_at', s.revoked_at
        ) ORDER BY s.revoked_at DESC)
        FROM public.b2b_seats s
        JOIN public.b2b_allocations al ON al.id = s.allocation_id
        JOIN public.subscription_types st ON st.id = al.subscription_type_id
        LEFT JOIN public.profiles p ON p.user_id = s.employee_user_id
        WHERE s.account_id = a.id AND s.status='revoked' AND s.consumed_slot
      ), '[]'::jsonb)
    ) AS acc
    FROM public.b2b_accounts a
    LEFT JOIN public.profiles o ON o.user_id = a.admin_user_id
  ) t;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_overview() TO authenticated;

-- Удаление пула/аккаунта: логику не трогаем — потраченные места уходят вместе
-- с пулом (каскад), слоты возвращать некуда, всё консистентно.
