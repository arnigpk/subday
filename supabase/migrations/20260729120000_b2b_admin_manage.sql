-- ============================================================================
-- B2B: полноценное управление на стороне платформенного админа.
--   • b2b_admin_overview       — все аккаунты с пулами и сотрудниками;
--   • b2b_admin_delete_account — удалить бизнес: снять подписки, удалить аккаунт
--                                (каскад пулов/мест), снять роль b2b_admin если
--                                владелец больше ничем не владеет;
--   • b2b_admin_delete_allocation — удалить пул: снять подписки его мест и удалить;
--   • b2b_admin_revoke_owner   — забрать доступ в кабинет у владельца (снять роль),
--                                данные бизнеса при этом сохраняются.
-- Отзыв отдельного места делаем через уже существующий b2b_revoke_seat.
-- Все функции — только для роли admin.
-- ============================================================================

-- Обзор для админки: всё в одном вызове.
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
      'seats_used', COALESCE((SELECT count(*) FROM public.b2b_seats WHERE account_id = a.id AND status='active'), 0),
      'allocations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', al.id, 'tier', st.name, 'seats_total', al.seats_total,
          'seats_used', COALESCE((SELECT count(*) FROM public.b2b_seats WHERE allocation_id = al.id AND status='active'), 0),
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
      ), '[]'::jsonb)
    ) AS acc
    FROM public.b2b_accounts a
    LEFT JOIN public.profiles o ON o.user_id = a.admin_user_id
  ) t;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_overview() TO authenticated;

-- Удаление всего бизнес-аккаунта.
CREATE OR REPLACE FUNCTION public.b2b_admin_delete_account(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  SELECT admin_user_id INTO v_owner FROM public.b2b_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Аккаунт не найден'; END IF;

  -- Снимаем выданные подписки активных мест.
  UPDATE public.user_subscriptions us SET is_active = false
    FROM public.b2b_seats s
   WHERE s.account_id = p_account_id AND s.status = 'active'
     AND us.id = s.subscription_id;

  -- Удаляем аккаунт (каскадом уйдут пулы и места).
  DELETE FROM public.b2b_accounts WHERE id = p_account_id;

  -- Если владелец больше не управляет ни одним аккаунтом — снимаем роль b2b_admin.
  IF v_owner IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.b2b_accounts WHERE admin_user_id = v_owner) THEN
    DELETE FROM public.user_roles WHERE user_id = v_owner AND role = 'b2b_admin';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_delete_account(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_delete_account(uuid) TO authenticated;

-- Удаление пула (аллокации) вместе с его местами.
CREATE OR REPLACE FUNCTION public.b2b_admin_delete_allocation(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.b2b_allocations WHERE id = p_allocation_id) THEN
    RAISE EXCEPTION 'Пул не найден';
  END IF;

  UPDATE public.user_subscriptions us SET is_active = false
    FROM public.b2b_seats s
   WHERE s.allocation_id = p_allocation_id AND s.status = 'active'
     AND us.id = s.subscription_id;

  DELETE FROM public.b2b_allocations WHERE id = p_allocation_id;
  RETURN jsonb_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_delete_allocation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_delete_allocation(uuid) TO authenticated;

-- Забрать у владельца доступ в кабинет (снять роль b2b_admin), данные сохранить.
CREATE OR REPLACE FUNCTION public.b2b_admin_revoke_owner(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  SELECT admin_user_id INTO v_owner FROM public.b2b_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Аккаунт не найден'; END IF;

  UPDATE public.b2b_accounts SET admin_user_id = NULL WHERE id = p_account_id;

  IF v_owner IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.b2b_accounts WHERE admin_user_id = v_owner) THEN
    DELETE FROM public.user_roles WHERE user_id = v_owner AND role = 'b2b_admin';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_revoke_owner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_revoke_owner(uuid) TO authenticated;
