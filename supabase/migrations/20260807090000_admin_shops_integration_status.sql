-- Статус POS-интеграций для админской страницы кофеен: только информация,
-- настройка остаётся в кабинете партнёра. Таблицы интеграций содержат секреты
-- (api_key, токены), поэтому фронт их напрямую не читает — отдаём агрегат через
-- SECURITY DEFINER RPC, доступный только админам, без единого секретного поля.

CREATE OR REPLACE FUNCTION public.get_shops_integration_status()
RETURNS TABLE (
  shop_id uuid,
  active_count integer,
  inactive_count integer,
  providers text[]   -- провайдеры с включённой интеграцией (iiko/poster/rosta)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH all_int AS (
    SELECT shop_id, 'iiko'   AS provider, is_active FROM public.iiko_integrations
    UNION ALL
    SELECT shop_id, 'poster' AS provider, is_active FROM public.poster_integrations
    UNION ALL
    SELECT shop_id, 'rosta'  AS provider, is_active FROM public.rosta_integrations
  )
  SELECT
    all_int.shop_id,
    count(*) FILTER (WHERE all_int.is_active)::int      AS active_count,
    count(*) FILTER (WHERE NOT all_int.is_active)::int  AS inactive_count,
    coalesce(
      array_agg(DISTINCT all_int.provider) FILTER (WHERE all_int.is_active),
      ARRAY[]::text[]
    )                                                   AS providers
  FROM all_int
  -- Доступ только админам: обычному вызывающему вернём пусто, а не данные.
  WHERE public.has_role(auth.uid(), 'admin')
  GROUP BY all_int.shop_id;
$$;

-- Обычные клиенты (партнёры/гости) не должны вызывать; оставляем authenticated,
-- но тело само отсекает не-админов через has_role в WHERE.
REVOKE ALL ON FUNCTION public.get_shops_integration_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_shops_integration_status() TO authenticated;
