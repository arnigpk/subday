-- Фикс двойных пушей на одном устройстве:
-- 1) Один и тот же FCM-токен = одно физическое устройство. При смене аккаунта на
--    устройстве старая запись (другой user_id, тот же token) оставалась — пуш
--    уходил дважды. Делаем token уникальным и перепривязываем при регистрации.
-- 2) Регистрация через SECURITY DEFINER RPC (RLS не позволяет клиенту трогать
--    чужие ряды) + удаление прежнего токена этого устройства при ротации.

-- Чистим существующие дубли: для каждого token оставляем самую свежую запись.
DELETE FROM public.device_tokens a
USING public.device_tokens b
WHERE a.token = b.token
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- Токен уникален глобально (устройство принадлежит одному аккаунту).
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_key ON public.device_tokens (token);

CREATE OR REPLACE FUNCTION public.register_device_token(_token text, _platform text, _old_token text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Ротация: прежний токен ЭТОГО устройства (после переустановки) убираем,
  -- чтобы то же устройство не получало пуш дважды.
  IF _old_token IS NOT NULL AND _old_token <> _token THEN
    DELETE FROM public.device_tokens WHERE user_id = auth.uid() AND token = _old_token;
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), _token, _platform, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO authenticated;
