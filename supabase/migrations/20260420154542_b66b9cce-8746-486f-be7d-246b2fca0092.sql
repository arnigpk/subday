-- Возвращаем широкую политику чтения профилей для authenticated
-- (нужно для Stories, комментариев, постов #subFlow — везде где показываем имя/аватар)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='Authenticated users can view profiles'
  ) THEN
    CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END$$;

-- Batch функция для публичных профилей (без phone) — для использования в новом коде
CREATE OR REPLACE FUNCTION public.get_public_profiles_batch(_user_ids uuid[])
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
  WHERE user_id = ANY(_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles_batch(uuid[]) TO authenticated, anon;