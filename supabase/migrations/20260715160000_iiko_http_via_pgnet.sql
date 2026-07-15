-- iiko прячет /api/2/menu/by_id за QRATOR (антибот), который блокирует TLS-отпечаток
-- Deno-fetch (HTML-500). pg_net (libcurl) проходит как обычный curl.
--
-- ВАЖНО: pg_net отправляет запрос только ПОСЛЕ коммита транзакции, поэтому нельзя
-- отправить и дождаться ответа в одной транзакции. Делаем две фазы:
--   iiko_http_post_start  — ставит запрос (коммит → pg_net отправляет), возвращает id;
--   iiko_http_result      — читает ответ по id (в отдельной транзакции; вызывающий поллит).
-- Разрешён ТОЛЬКО хост iiko.

DROP FUNCTION IF EXISTS public.iiko_http_post_sync(text, jsonb, jsonb, int);

CREATE OR REPLACE FUNCTION public.iiko_http_post_start(_url text, _headers jsonb, _body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE _req bigint;
BEGIN
  IF _url IS NULL OR _url NOT LIKE 'https://api-ru.iiko.services/%' THEN
    RAISE EXCEPTION 'iiko_http_post_start: only api-ru.iiko.services is allowed';
  END IF;
  SELECT net.http_post(url := _url, body := _body, headers := _headers) INTO _req;
  RETURN _req;
END;
$$;

CREATE OR REPLACE FUNCTION public.iiko_http_result(_req bigint)
RETURNS TABLE(status_code int, content text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, net
AS $$
  SELECT r.status_code, r.content FROM net._http_response r WHERE r.id = _req;
$$;

REVOKE ALL ON FUNCTION public.iiko_http_post_start(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iiko_http_result(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iiko_http_post_start(text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.iiko_http_result(bigint) TO service_role;
