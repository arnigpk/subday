-- ============================================================================
-- B2B: смена/назначение админа бизнес-кабинета (владельца) без потери данных.
-- Пул, выдачи мест и вся аналитика привязаны к b2b_accounts.id, а НЕ к владельцу,
-- поэтому смена admin_user_id ничего из этого не трогает — статистика остаётся.
--   • новому владельцу выдаётся роль b2b_admin (если ещё нет);
--   • у прежнего роль снимается, если он больше не управляет ни одним аккаунтом.
-- Работает и как «назначить», когда владелец был снят (admin_user_id = NULL).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.b2b_admin_set_owner(p_account_id uuid, p_new_admin_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF p_new_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Нужно указать пользователя';
  END IF;

  SELECT admin_user_id INTO v_old FROM public.b2b_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Аккаунт не найден';
  END IF;

  IF v_old IS NOT DISTINCT FROM p_new_admin_user_id THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  -- Назначаем нового владельца (пул/выдачи/аналитика остаются на аккаунте).
  UPDATE public.b2b_accounts SET admin_user_id = p_new_admin_user_id WHERE id = p_account_id;

  -- Роль новому, если ещё нет.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_new_admin_user_id AND role = 'b2b_admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_new_admin_user_id, 'b2b_admin');
  END IF;

  -- Снимаем роль у прежнего, если он больше ничем не владеет.
  IF v_old IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.b2b_accounts WHERE admin_user_id = v_old) THEN
    DELETE FROM public.user_roles WHERE user_id = v_old AND role = 'b2b_admin';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_set_owner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_set_owner(uuid, uuid) TO authenticated;
