-- ============================================================================
-- B2B: корпоративные подписки. Бизнесу выдаётся пул мест тарифа (например
-- 100 × Subday Max), бизнес сам раздаёт места сотрудникам. Ключевые инварианты:
--   • нельзя выдать больше мест, чем в пуле (атомарно, FOR UPDATE);
--   • нельзя выдать одному сотруднику два активных места из одного пула;
--   • отзыв места деактивирует именно ту подписку, что выдал бизнес.
-- ============================================================================

-- 1. Бизнес-аккаунт ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  contact_name  text,
  contact_phone text,
  admin_user_id uuid,                       -- кто управляет кабинетом B2B
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Пул мест (аллокация) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_allocations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES public.b2b_accounts(id) ON DELETE CASCADE,
  subscription_type_id uuid NOT NULL REFERENCES public.subscription_types(id),
  seats_total          int NOT NULL CHECK (seats_total > 0),
  granted_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz
);

-- 3. Место = выданная сотруднику подписка ------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_seats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES public.b2b_accounts(id) ON DELETE CASCADE,
  allocation_id    uuid NOT NULL REFERENCES public.b2b_allocations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL,
  subscription_id  uuid,                     -- созданная user_subscription (для отзыва)
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz
);

-- Один активный место на пару (пул, сотрудник).
CREATE UNIQUE INDEX IF NOT EXISTS idx_b2b_seat_alloc_emp_active
  ON public.b2b_seats (allocation_id, employee_user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_b2b_seats_account ON public.b2b_seats (account_id, status);

-- 4. RLS: платформенный админ — всё; b2b_admin — только свой аккаунт ----------
ALTER TABLE public.b2b_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_seats       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b accounts read" ON public.b2b_accounts;
CREATE POLICY "b2b accounts read" ON public.b2b_accounts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR admin_user_id = auth.uid());
DROP POLICY IF EXISTS "b2b accounts admin manage" ON public.b2b_accounts;
CREATE POLICY "b2b accounts admin manage" ON public.b2b_accounts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "b2b allocations read" ON public.b2b_allocations;
CREATE POLICY "b2b allocations read" ON public.b2b_allocations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR account_id IN (SELECT id FROM public.b2b_accounts WHERE admin_user_id = auth.uid()));
DROP POLICY IF EXISTS "b2b allocations admin manage" ON public.b2b_allocations;
CREATE POLICY "b2b allocations admin manage" ON public.b2b_allocations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "b2b seats read" ON public.b2b_seats;
CREATE POLICY "b2b seats read" ON public.b2b_seats FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR account_id IN (SELECT id FROM public.b2b_accounts WHERE admin_user_id = auth.uid()));
-- Запись в b2b_seats — только через RPC (SECURITY DEFINER), прямых политик записи нет.

-- 5. Выдача места (атомарно) -------------------------------------------------
CREATE OR REPLACE FUNCTION public.b2b_assign_seat(p_allocation_id uuid, p_employee_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_alloc   public.b2b_allocations;
  v_used    int;
  v_sub_id  uuid;
  v_seat_id uuid;
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

  RETURN jsonb_build_object('ok', true, 'seat_id', v_seat_id, 'used', v_used + 1, 'total', v_alloc.seats_total);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_assign_seat(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_assign_seat(uuid, uuid) TO authenticated;

-- 6. Отзыв места -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b2b_revoke_seat(p_seat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_seat public.b2b_seats;
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

  -- Деактивируем именно ту подписку, что выдали.
  IF v_seat.subscription_id IS NOT NULL THEN
    UPDATE public.user_subscriptions SET is_active = false WHERE id = v_seat.subscription_id;
  END IF;

  UPDATE public.b2b_seats SET status = 'revoked', revoked_at = now() WHERE id = p_seat_id;
  RETURN jsonb_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_revoke_seat(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_revoke_seat(uuid) TO authenticated;

-- 7. Обзор кабинета B2B (для админа бизнеса) ---------------------------------
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
      LEFT JOIN (SELECT allocation_id, count(*) used FROM public.b2b_seats WHERE status='active' GROUP BY 1) u
        ON u.allocation_id = al.id
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
        'last_visit', r.last_at
      ) ORDER BY s.assigned_at DESC)
      FROM public.b2b_seats s
      JOIN public.b2b_allocations al ON al.id = s.allocation_id
      JOIN public.subscription_types st ON st.id = al.subscription_type_id
      LEFT JOIN public.profiles p ON p.user_id = s.employee_user_id
      LEFT JOIN (SELECT user_id, count(*) cnt, max(redeemed_at) last_at FROM public.redemptions GROUP BY 1) r
        ON r.user_id = s.employee_user_id
      WHERE s.account_id = v_account.id AND s.status = 'active'
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
    )
  ) INTO v_result;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_get_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_get_overview() TO authenticated;
