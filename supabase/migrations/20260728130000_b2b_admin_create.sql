-- Создание B2B-аккаунта платформенным админом: создаёт аккаунт и выдаёт
-- пользователю роль b2b_admin (атомарно). Только для роли admin.
CREATE OR REPLACE FUNCTION public.b2b_admin_create_account(
  p_name text,
  p_admin_user_id uuid,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Только администратор может создавать B2B-аккаунты';
  END IF;
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Нужно указать администратора бизнеса';
  END IF;

  INSERT INTO public.b2b_accounts (name, admin_user_id, contact_name, contact_phone)
  VALUES (p_name, p_admin_user_id, p_contact_name, p_contact_phone)
  RETURNING id INTO v_id;

  -- Выдаём роль b2b_admin, если её ещё нет.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_admin_user_id AND role = 'b2b_admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_admin_user_id, 'b2b_admin');
  END IF;

  RETURN v_id;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_admin_create_account(text, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_admin_create_account(text, uuid, text, text) TO authenticated;
