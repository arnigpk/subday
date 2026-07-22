-- ============================================================================
-- Аналитика кофейни для партнёрского кабинета.
-- Только реальные данные из redemptions. Доступ: админ — к любой кофейне,
-- партнёр/бариста — только к своим (get_staff_shop_ids). Часы считаем в
-- Asia/Almaty (пользователю важно локальное время пиков).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_shop_analytics(
  p_shop_id text,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin'::app_role);
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to   timestamptz := COALESCE(p_to, now());
  v_result jsonb;
BEGIN
  -- Доступ: админ — к любой; иначе кофейня должна быть среди своих.
  IF NOT v_is_admin THEN
    IF p_shop_id IS NULL OR p_shop_id <> ALL (ARRAY(SELECT public.get_staff_shop_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Недостаточно прав для просмотра аналитики этой кофейни';
    END IF;
  END IF;

  WITH r AS (
    SELECT * FROM public.redemptions
     WHERE shop_id = p_shop_id
       AND redeemed_at >= v_from AND redeemed_at <= v_to
  ),
  -- Первый визит гостя В ЭТУ кофейню (за всё время) — чтобы «новый» считался
  -- честно: тот, кого раньше здесь не было вовсе.
  firsts AS (
    SELECT user_id, min(redeemed_at) AS first_at
      FROM public.redemptions WHERE shop_id = p_shop_id GROUP BY user_id
  ),
  base AS (
    SELECT
      count(*)                                   AS total,
      count(DISTINCT r.user_id)                  AS unique_guests,
      count(DISTINCT r.user_id) FILTER (
        WHERE f.first_at >= v_from AND f.first_at <= v_to
      )                                          AS new_guests,
      COALESCE(sum(r.payout_price), 0)           AS revenue,
      count(*) FILTER (WHERE r.drink_type = 'coffee') AS coffee_cnt,
      count(*) FILTER (WHERE r.drink_type <> 'coffee' OR r.drink_type IS NULL) AS other_cnt
    FROM r LEFT JOIN firsts f ON f.user_id = r.user_id
  ),
  by_hour AS (
    SELECT jsonb_agg(jsonb_build_object('h', h, 'c', COALESCE(c, 0)) ORDER BY h) AS data
    FROM generate_series(0, 23) AS g(h)
    LEFT JOIN (
      SELECT extract(hour FROM redeemed_at AT TIME ZONE 'Asia/Almaty')::int AS hh, count(*) c
        FROM r GROUP BY 1
    ) x ON x.hh = g.h
  ),
  by_dow AS (
    SELECT jsonb_agg(jsonb_build_object('d', d, 'c', COALESCE(c, 0)) ORDER BY d) AS data
    FROM generate_series(1, 7) AS g(d)
    LEFT JOIN (
      SELECT CASE WHEN extract(isodow FROM redeemed_at AT TIME ZONE 'Asia/Almaty')::int = 0
                  THEN 7 ELSE extract(isodow FROM redeemed_at AT TIME ZONE 'Asia/Almaty')::int END AS dd,
             count(*) c
        FROM r GROUP BY 1
    ) x ON x.dd = g.d
  ),
  by_tier AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'c', c) ORDER BY c DESC), '[]'::jsonb) AS data
    FROM (
      SELECT COALESCE(subscription_name, 'Без тарифа') AS name, count(*) c
        FROM r GROUP BY 1 ORDER BY c DESC LIMIT 8
    ) t
  )
  SELECT jsonb_build_object(
    'total',            base.total,
    'unique_guests',    base.unique_guests,
    'new_guests',       base.new_guests,
    'returning_guests', GREATEST(0, base.unique_guests - base.new_guests),
    'revenue',          base.revenue,
    'coffee_cnt',       base.coffee_cnt,
    'other_cnt',        base.other_cnt,
    'by_hour',          COALESCE(by_hour.data, '[]'::jsonb),
    'by_dow',           COALESCE(by_dow.data, '[]'::jsonb),
    'by_tier',          by_tier.data,
    'from',             v_from,
    'to',               v_to
  ) INTO v_result
  FROM base, by_hour, by_dow, by_tier;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.get_shop_analytics(text, timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_analytics(text, timestamptz, timestamptz) TO authenticated;
