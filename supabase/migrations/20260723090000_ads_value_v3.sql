-- ============================================================================
-- Реклама v3: ценность вместо показов.
--   1) поведенческий таргет на своих данных (был/не был/давно не был);
--   2) равномерная открутка бюджета;
--   3) общий кап показов на пользователя;
--   4) промо-формат через существующие special_offers;
--   5) атрибуция клика/показа до реального списания в кофейне (7 и 14 дней);
--   6) оценка охвата перед запуском кампании.
-- ============================================================================

-- 1. Новые настройки объявления — одинаковые для баннеров и SubFlow ----------
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subflow_ads', 'ad_banners'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS behavior_target text NOT NULL DEFAULT 'any',
        ADD COLUMN IF NOT EXISTS behavior_days int NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS exclude_visited_days int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS target_competitor_shop_ids uuid[],
        ADD COLUMN IF NOT EXISTS pacing text NOT NULL DEFAULT 'asap',
        ADD COLUMN IF NOT EXISTS special_offer_id uuid
          REFERENCES public.special_offers(id) ON DELETE SET NULL
    $f$, t);

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_behavior_chk');
    EXECUTE format($f$
      ALTER TABLE public.%I ADD CONSTRAINT %I
        CHECK (behavior_target IN ('any', 'new', 'lapsed', 'active'))
    $f$, t, t || '_behavior_chk');

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_pacing_chk');
    EXECUTE format($f$
      ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (pacing IN ('asap', 'even'))
    $f$, t, t || '_pacing_chk');
  END LOOP;
END $mig$;

COMMENT ON COLUMN public.subflow_ads.behavior_target IS
  'any — всем; new — не был в этой кофейне ни разу; lapsed — был, но не приходил behavior_days; active — был за behavior_days';
COMMENT ON COLUMN public.subflow_ads.pacing IS
  'asap — крутить как пойдёт; even — растянуть бюджет показов равномерно на период кампании';

-- 2. Общий кап показов рекламы на пользователя -------------------------------
CREATE TABLE IF NOT EXISTS public.ads_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  max_ads_per_day     int NOT NULL DEFAULT 0,   -- 0 = без ограничения
  max_ads_per_session int NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ads_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ads_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read ads settings" ON public.ads_settings;
CREATE POLICY "Anyone can read ads settings" ON public.ads_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage ads settings" ON public.ads_settings;
CREATE POLICY "Admins manage ads settings" ON public.ads_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Единая лента касаний (показы/клики обоих типов рекламы) -----------------
CREATE OR REPLACE VIEW public.ad_touches AS
SELECT 'subflow'::text AS ad_kind, e.ad_id AS ad_id, a.shop_id,
       a.title AS ad_title, e.user_id, e.event_type, e.created_at
  FROM public.subflow_ad_events e
  JOIN public.subflow_ads a ON a.id = e.ad_id
UNION ALL
SELECT 'banner', e.banner_id, b.shop_id,
       COALESCE(NULLIF(b.caption, ''), 'Баннер'), e.user_id, e.event_type, e.created_at
  FROM public.ad_banner_events e
  JOIN public.ad_banners b ON b.id = e.banner_id;

-- 4. Атрибуция: касание -> списание в той же кофейне в течение 14 дней -------
-- На каждое списание берём одно, самое «сильное» касание: клик важнее показа,
-- при равенстве — ближайшее по времени. Так одно списание не засчитывается
-- объявлению дважды.
CREATE OR REPLACE VIEW public.ad_attributed_redemptions AS
SELECT DISTINCT ON (t.ad_kind, t.ad_id, r.id)
       t.ad_kind,
       t.ad_id,
       t.shop_id,
       r.id            AS redemption_id,
       r.user_id,
       t.event_type    AS touch_type,
       t.created_at    AS touch_at,
       r.redeemed_at,
       (r.redeemed_at <= t.created_at + interval '7 days') AS within_7d,
       COALESCE(r.payout_price, 0) AS payout_price,
       NOT EXISTS (
         SELECT 1 FROM public.redemptions pr
          WHERE pr.user_id = r.user_id
            AND pr.shop_id = r.shop_id
            AND pr.redeemed_at < t.created_at
       ) AS is_new_guest
  FROM public.ad_touches t
  JOIN public.redemptions r
    ON r.user_id     = t.user_id
   AND r.shop_id     = t.shop_id::text
   AND r.redeemed_at > t.created_at
   AND r.redeemed_at <= t.created_at + interval '14 days'
 WHERE t.user_id IS NOT NULL
   AND t.shop_id IS NOT NULL
 ORDER BY t.ad_kind, t.ad_id, r.id, (t.event_type = 'click') DESC, t.created_at DESC;

-- 5. Сводка по объявлению ----------------------------------------------------
CREATE OR REPLACE VIEW public.ad_performance AS
WITH ev AS (
  SELECT ad_kind, ad_id, min(ad_title) AS ad_title, shop_id,
         count(*) FILTER (WHERE event_type = 'view')  AS views,
         count(*) FILTER (WHERE event_type = 'click') AS clicks,
         count(DISTINCT user_id) FILTER (WHERE event_type = 'view') AS reach
    FROM public.ad_touches
   GROUP BY ad_kind, ad_id, shop_id
), att AS (
  SELECT ad_kind, ad_id,
         count(*) FILTER (WHERE touch_type = 'click' AND within_7d) AS conv_click_7d,
         count(*) FILTER (WHERE touch_type = 'click')               AS conv_click_14d,
         count(*) FILTER (WHERE within_7d)                          AS conv_any_7d,
         count(*)                                                   AS conv_any_14d,
         count(DISTINCT user_id)                                    AS conv_users,
         count(*) FILTER (WHERE is_new_guest)                       AS new_guests,
         COALESCE(sum(payout_price), 0)                             AS revenue
    FROM public.ad_attributed_redemptions
   GROUP BY ad_kind, ad_id
)
SELECT ev.ad_kind, ev.ad_id, ev.ad_title, ev.shop_id,
       ev.views, ev.clicks, ev.reach,
       CASE WHEN ev.views > 0 THEN round(ev.clicks::numeric * 100 / ev.views, 2) ELSE 0 END AS ctr,
       COALESCE(att.conv_click_7d, 0)  AS conv_click_7d,
       COALESCE(att.conv_click_14d, 0) AS conv_click_14d,
       COALESCE(att.conv_any_7d, 0)    AS conv_any_7d,
       COALESCE(att.conv_any_14d, 0)   AS conv_any_14d,
       COALESCE(att.conv_users, 0)     AS conv_users,
       COALESCE(att.new_guests, 0)     AS new_guests,
       COALESCE(att.revenue, 0)        AS revenue
  FROM ev LEFT JOIN att USING (ad_kind, ad_id);

-- Вьюхи считают по всей базе, поэтому напрямую их не отдаём: доступ только
-- через функции ниже, которые сами проверяют права.
REVOKE ALL ON public.ad_touches, public.ad_attributed_redemptions, public.ad_performance
  FROM anon, authenticated;

-- 6. Отчёт для админа и партнёра --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ad_performance(p_shop_id uuid DEFAULT NULL)
RETURNS SETOF public.ad_performance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin'::app_role);
  v_staff_shop text   := get_staff_shop_id(auth.uid());
BEGIN
  IF v_is_admin THEN
    RETURN QUERY SELECT * FROM public.ad_performance p
      WHERE p_shop_id IS NULL OR p.shop_id = p_shop_id;
  ELSIF v_staff_shop IS NOT NULL THEN
    -- Партнёр видит только свою кофейню, что бы он ни передал.
    RETURN QUERY SELECT * FROM public.ad_performance p
      WHERE p.shop_id::text = v_staff_shop;
  ELSE
    RAISE EXCEPTION 'Недостаточно прав для просмотра статистики рекламы';
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.get_ad_performance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_performance(uuid) TO authenticated;

-- 7. Оценка охвата перед запуском -------------------------------------------
-- Повторяет клиентскую логику отбора, чтобы админ ещё до сохранения видел,
-- на скольких людей вообще попадёт кампания (и не улетел в нулевую аудиторию).
CREATE OR REPLACE FUNCTION public.estimate_ad_reach(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_total    bigint;
  v_matched  bigint;
  v_country  text  := NULLIF(p->>'country', '');
  v_city     text  := NULLIF(p->>'city', '');
  v_shop     uuid  := NULLIF(p->>'shop_id', '')::uuid;
  v_behavior text  := COALESCE(NULLIF(p->>'behavior_target', ''), 'any');
  v_bdays    int   := COALESCE((p->>'behavior_days')::int, 30);
  v_excl     int   := COALESCE((p->>'exclude_visited_days')::int, 0);
  v_aud      text[] := COALESCE(
                 ARRAY(SELECT jsonb_array_elements_text(p->'audience_types')), ARRAY['all']);
  v_subs     uuid[] := COALESCE(
                 ARRAY(SELECT jsonb_array_elements_text(p->'target_subscription_type_ids')::uuid), '{}');
  v_comp     uuid[] := COALESCE(
                 ARRAY(SELECT jsonb_array_elements_text(p->'target_competitor_shop_ids')::uuid), '{}');
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Оценка охвата доступна только администратору';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles WHERE COALESCE(is_blocked, false) = false;

  SELECT count(*) INTO v_matched
    FROM public.profiles pr
   WHERE COALESCE(pr.is_blocked, false) = false
     -- гео
     AND (v_country IS NULL OR pr.country = v_country)
     AND (v_city    IS NULL OR pr.city    = v_city)
     -- аудитория
     AND (
       'all' = ANY(v_aud)
       OR ('subscribers' = ANY(v_aud) AND EXISTS (
             SELECT 1 FROM public.user_subscriptions s
              WHERE s.user_id = pr.user_id AND s.is_active))
       OR ('no_subscription' = ANY(v_aud) AND NOT EXISTS (
             SELECT 1 FROM public.user_subscriptions s
              WHERE s.user_id = pr.user_id AND s.is_active))
       OR ('expiring_soon' = ANY(v_aud) AND EXISTS (
             SELECT 1 FROM public.user_subscriptions s
              WHERE s.user_id = pr.user_id AND s.is_active
                AND s.expires_at BETWEEN now() AND now() + interval '5 days'))
       OR ('new_users' = ANY(v_aud) AND pr.created_at >= now() - interval '7 days')
       OR ('inactive' = ANY(v_aud)
             AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions s
                              WHERE s.user_id = pr.user_id AND s.is_active)
             AND NOT EXISTS (SELECT 1 FROM public.redemptions r
                              WHERE r.user_id = pr.user_id
                                AND r.redeemed_at >= now() - interval '30 days'))
     )
     -- тариф подписки
     AND (cardinality(v_subs) = 0 OR EXISTS (
           SELECT 1 FROM public.user_subscriptions s
            WHERE s.user_id = pr.user_id AND s.is_active
              AND s.subscription_type_id = ANY(v_subs)))
     -- поведение относительно рекламируемой кофейни
     AND (v_shop IS NULL OR v_behavior = 'any' OR CASE v_behavior
           WHEN 'new' THEN NOT EXISTS (
             SELECT 1 FROM public.redemptions r
              WHERE r.user_id = pr.user_id AND r.shop_id = v_shop::text)
           WHEN 'lapsed' THEN EXISTS (
             SELECT 1 FROM public.redemptions r
              WHERE r.user_id = pr.user_id AND r.shop_id = v_shop::text)
             AND NOT EXISTS (
             SELECT 1 FROM public.redemptions r
              WHERE r.user_id = pr.user_id AND r.shop_id = v_shop::text
                AND r.redeemed_at >= now() - make_interval(days => v_bdays))
           WHEN 'active' THEN EXISTS (
             SELECT 1 FROM public.redemptions r
              WHERE r.user_id = pr.user_id AND r.shop_id = v_shop::text
                AND r.redeemed_at >= now() - make_interval(days => v_bdays))
           ELSE true END)
     -- исключение недавних гостей
     AND (v_excl = 0 OR v_shop IS NULL OR NOT EXISTS (
           SELECT 1 FROM public.redemptions r
            WHERE r.user_id = pr.user_id AND r.shop_id = v_shop::text
              AND r.redeemed_at >= now() - make_interval(days => v_excl)))
     -- «ходит к конкурентам»
     AND (cardinality(v_comp) = 0 OR EXISTS (
           SELECT 1 FROM public.redemptions r
            WHERE r.user_id = pr.user_id
              AND r.shop_id = ANY(SELECT unnest(v_comp)::text)
              AND r.redeemed_at >= now() - make_interval(days => GREATEST(v_bdays, 30))));

  RETURN jsonb_build_object('matched', v_matched, 'total', v_total);
END $fn$;

REVOKE ALL ON FUNCTION public.estimate_ad_reach(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.estimate_ad_reach(jsonb) TO authenticated;
