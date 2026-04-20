-- Откатываем REVOKE — column-level GRANT в PG не работает выборочно для self
GRANT SELECT (phone) ON public.profiles TO authenticated;

-- Убираем "открывающую" политику, оставляем только targeted policies
DROP POLICY IF EXISTS "Authenticated can view profile rows" ON public.profiles;

-- Проверяем: должны остаться "Staff can view customer profiles" (self + staff) и "Users can update own profile" + admin policies.
-- Этого достаточно: чужие строки не видны обычным пользователям → телефоны защищены.

-- public_profiles view продолжает работать для публичного просмотра без phone
-- (например, для #subFlow где нужны nickname/avatar). Он использует security_invoker
-- и читает только разрешённые строки текущего пользователя — НО мы хотим чтобы
-- любой видел публичные профили других. Поэтому делаем view как SECURITY DEFINER на чтение публичных полей:
DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.get_public_profile(_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  subflow_nickname text,
  public_id text,
  city text,
  country text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, name, avatar_url, subflow_nickname, public_id, city, country
  FROM public.profiles
  WHERE user_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO authenticated, anon;