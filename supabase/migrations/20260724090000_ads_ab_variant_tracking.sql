-- ============================================================================
-- A/B-тест был наполовину декоративным: клиент показывал разные креативы, но
-- не записывал, КАКОЙ вариант человек увидел. Провести тест было можно,
-- прочитать результат — нет.
-- Теперь вариант пишется в событие, и статистика считается отдельно по A и B.
-- ============================================================================

ALTER TABLE public.subflow_ad_events ADD COLUMN IF NOT EXISTS ab_variant text;
ALTER TABLE public.ad_banner_events  ADD COLUMN IF NOT EXISTS ab_variant text;

-- Старые события вариантов не знали — считаем их вариантом A.
UPDATE public.subflow_ad_events SET ab_variant = 'A' WHERE ab_variant IS NULL;
UPDATE public.ad_banner_events  SET ab_variant = 'A' WHERE ab_variant IS NULL;

DROP FUNCTION IF EXISTS public.get_ad_performance(uuid);
DROP VIEW IF EXISTS public.ad_performance;
DROP VIEW IF EXISTS public.ad_user_conversions;
DROP VIEW IF EXISTS public.ad_touches;

CREATE OR REPLACE VIEW public.ad_touches AS
SELECT 'subflow'::text AS ad_kind, e.ad_id AS ad_id, a.shop_id,
       a.title AS ad_title, e.user_id, e.event_type,
       COALESCE(e.ab_variant, 'A') AS ab_variant, e.created_at
  FROM public.subflow_ad_events e
  JOIN public.subflow_ads a ON a.id = e.ad_id
UNION ALL
SELECT 'banner', e.banner_id, b.shop_id,
       COALESCE(NULLIF(b.caption, ''), 'Баннер'), e.user_id, e.event_type,
       COALESCE(e.ab_variant, 'A'), e.created_at
  FROM public.ad_banner_events e
  JOIN public.ad_banners b ON b.id = e.banner_id;

CREATE OR REPLACE VIEW public.ad_user_conversions AS
WITH touch AS (
  SELECT ad_kind, ad_id, shop_id, user_id,
         min(created_at)                                    AS first_touch_at,
         min(created_at) FILTER (WHERE event_type = 'click') AS first_click_at,
         -- Вариант стабилен для пользователя, поэтому берём его с первого касания.
         (ARRAY_AGG(ab_variant ORDER BY created_at))[1]      AS ab_variant
    FROM public.ad_touches
   WHERE user_id IS NOT NULL AND shop_id IS NOT NULL
   GROUP BY ad_kind, ad_id, shop_id, user_id
)
SELECT t.ad_kind, t.ad_id, t.shop_id, t.user_id, t.ab_variant,
       t.first_touch_at, t.first_click_at, fv.first_visit_at,
       (fv.first_visit_at IS NOT NULL
         AND fv.first_visit_at <= t.first_touch_at + interval '7 days') AS converted_7d,
       (fv.first_visit_at IS NOT NULL)                                  AS converted_14d,
       (t.first_click_at IS NOT NULL
         AND fv.first_visit_at IS NOT NULL
         AND fv.first_visit_at > t.first_click_at)                      AS post_click,
       NOT EXISTS (
         SELECT 1 FROM public.redemptions pr
          WHERE pr.user_id = t.user_id
            AND pr.shop_id = t.shop_id::text
            AND pr.redeemed_at < t.first_touch_at
       ) AS is_new_guest,
       COALESCE(vis.visits_14d, 0)  AS visits_14d,
       COALESCE(vis.revenue_14d, 0) AS revenue_14d
  FROM touch t
  LEFT JOIN LATERAL (
    SELECT min(r.redeemed_at) AS first_visit_at
      FROM public.redemptions r
     WHERE r.user_id = t.user_id AND r.shop_id = t.shop_id::text
       AND r.redeemed_at >  t.first_touch_at
       AND r.redeemed_at <= t.first_touch_at + interval '14 days'
  ) fv ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS visits_14d, COALESCE(sum(r.payout_price), 0) AS revenue_14d
      FROM public.redemptions r
     WHERE r.user_id = t.user_id AND r.shop_id = t.shop_id::text
       AND r.redeemed_at >  t.first_touch_at
       AND r.redeemed_at <= t.first_touch_at + interval '14 days'
  ) vis ON true;

CREATE OR REPLACE VIEW public.ad_performance AS
WITH ev AS (
  SELECT ad_kind, ad_id, min(ad_title) AS ad_title, shop_id,
         count(*) FILTER (WHERE event_type = 'view')  AS views,
         count(*) FILTER (WHERE event_type = 'click') AS clicks,
         count(DISTINCT user_id) FILTER (WHERE event_type = 'view') AS reach,
         count(*) FILTER (WHERE event_type = 'view'  AND ab_variant = 'A') AS views_a,
         count(*) FILTER (WHERE event_type = 'click' AND ab_variant = 'A') AS clicks_a,
         count(*) FILTER (WHERE event_type = 'view'  AND ab_variant = 'B') AS views_b,
         count(*) FILTER (WHERE event_type = 'click' AND ab_variant = 'B') AS clicks_b
    FROM public.ad_touches
   GROUP BY ad_kind, ad_id, shop_id
), conv AS (
  SELECT ad_kind, ad_id,
         count(*) FILTER (WHERE converted_7d)                     AS conv_users_7d,
         count(*) FILTER (WHERE converted_14d)                    AS conv_users_14d,
         count(*) FILTER (WHERE converted_7d  AND is_new_guest)   AS new_guests_7d,
         count(*) FILTER (WHERE converted_14d AND is_new_guest)   AS new_guests_14d,
         count(*) FILTER (WHERE converted_14d AND post_click)     AS conv_post_click,
         count(*) FILTER (WHERE converted_14d AND NOT post_click) AS conv_post_view,
         count(*) FILTER (WHERE converted_14d AND ab_variant = 'A') AS conv_a,
         count(*) FILTER (WHERE converted_14d AND ab_variant = 'B') AS conv_b,
         COALESCE(sum(visits_14d)  FILTER (WHERE converted_14d), 0) AS visits_14d,
         COALESCE(sum(revenue_14d) FILTER (WHERE converted_14d), 0) AS revenue_14d,
         round(avg(EXTRACT(epoch FROM (first_visit_at - first_touch_at)) / 3600)
               FILTER (WHERE converted_14d)::numeric, 1) AS avg_hours_to_visit
    FROM public.ad_user_conversions
   GROUP BY ad_kind, ad_id
)
SELECT ev.ad_kind, ev.ad_id, ev.ad_title, ev.shop_id,
       ev.views, ev.clicks, ev.reach,
       CASE WHEN ev.views > 0 THEN round(ev.clicks::numeric * 100 / ev.views, 2) ELSE 0 END AS ctr,
       ev.views_a, ev.clicks_a, ev.views_b, ev.clicks_b,
       COALESCE(c.conv_a, 0) AS conv_a,
       COALESCE(c.conv_b, 0) AS conv_b,
       CASE WHEN ev.views_a > 0 THEN round(ev.clicks_a::numeric * 100 / ev.views_a, 2) ELSE 0 END AS ctr_a,
       CASE WHEN ev.views_b > 0 THEN round(ev.clicks_b::numeric * 100 / ev.views_b, 2) ELSE 0 END AS ctr_b,
       COALESCE(c.conv_users_7d, 0)   AS conv_users_7d,
       COALESCE(c.conv_users_14d, 0)  AS conv_users_14d,
       COALESCE(c.new_guests_7d, 0)   AS new_guests_7d,
       COALESCE(c.new_guests_14d, 0)  AS new_guests_14d,
       COALESCE(c.conv_post_click, 0) AS conv_post_click,
       COALESCE(c.conv_post_view, 0)  AS conv_post_view,
       COALESCE(c.visits_14d, 0)      AS visits_14d,
       COALESCE(c.revenue_14d, 0)     AS revenue_14d,
       c.avg_hours_to_visit,
       CASE WHEN ev.reach > 0
            THEN round(COALESCE(c.conv_users_14d, 0)::numeric * 100 / ev.reach, 2)
            ELSE 0 END AS conv_rate_14d
  FROM ev LEFT JOIN conv c USING (ad_kind, ad_id);

REVOKE ALL ON public.ad_touches, public.ad_user_conversions, public.ad_performance
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_ad_performance(p_shop_id uuid DEFAULT NULL)
RETURNS SETOF public.ad_performance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_is_admin   boolean := has_role(auth.uid(), 'admin'::app_role);
  v_staff_shop text    := get_staff_shop_id(auth.uid());
BEGIN
  IF v_is_admin THEN
    RETURN QUERY SELECT * FROM public.ad_performance p
      WHERE p_shop_id IS NULL OR p.shop_id = p_shop_id;
  ELSIF v_staff_shop IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.ad_performance p
      WHERE p.shop_id::text = v_staff_shop;
  ELSE
    RAISE EXCEPTION 'Недостаточно прав для просмотра статистики рекламы';
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.get_ad_performance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_performance(uuid) TO authenticated;
