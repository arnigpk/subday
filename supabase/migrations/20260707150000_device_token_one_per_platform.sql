-- Дубли пуш-уведомлений: у одного физического устройства накапливалось несколько
-- валидных FCM-токенов (localStorage чистится при переустановке → старый токен
-- остаётся в БД), а функции отправки шлют на ВСЕ токены пользователя → 2+ пуша на
-- одно устройство. Правило: ОДИН токен на (user_id, platform).
--
-- Реализация серверная (правим RPC register_device_token + разовая чистка) —
-- пересборка приложения не нужна, старый клиент уже зовёт эту RPC.

-- 1) RPC: перед сохранением нового токена удаляем все прочие токены этого
--    пользователя на той же платформе. Разные платформы (ios/android/web) не
--    затрагиваются. Сигнатура прежняя — совместимо с уже установленным клиентом.
CREATE OR REPLACE FUNCTION public.register_device_token(_token text, _platform text, _old_token text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Одно устройство на платформу = один токен: убираем прежние токены этого
  -- пользователя на той же платформе (в т.ч. осиротевшие после переустановки).
  DELETE FROM public.device_tokens
    WHERE user_id = auth.uid() AND platform = _platform AND token <> _token;

  -- Токен мог принадлежать другому аккаунту на этом устройстве — переносим на текущего.
  DELETE FROM public.device_tokens WHERE token = _token AND user_id <> auth.uid();

  INSERT INTO public.device_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), _token, _platform, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform, updated_at = now();
END;
$function$;

-- 2) Разовая чистка существующих дублей: оставляем самый свежий токен на
--    (user_id, platform), остальные удаляем.
DELETE FROM public.device_tokens dt
USING (
  SELECT id, row_number() OVER (
           PARTITION BY user_id, platform
           ORDER BY updated_at DESC, created_at DESC
         ) AS rn
  FROM public.device_tokens
) ranked
WHERE dt.id = ranked.id AND ranked.rn > 1;
