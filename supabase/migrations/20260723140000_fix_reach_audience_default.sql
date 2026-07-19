-- estimate_ad_reach всегда возвращал matched = 0.
-- ARRAY(SELECT jsonb_array_elements_text(...)) на отсутствующем ключе даёт
-- пустой массив, а не NULL, поэтому COALESCE(..., ARRAY['all']) не срабатывал:
-- v_aud оставался '{}', и проверка «'all' = ANY(v_aud)» была ложной для всех.
-- Пустой массив здесь означает «без ограничения по аудитории».
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
                 NULLIF(ARRAY(SELECT jsonb_array_elements_text(p->'audience_types')), '{}'),
                 ARRAY['all']);
  v_subs     uuid[] := ARRAY(SELECT jsonb_array_elements_text(p->'target_subscription_type_ids')::uuid);
  v_comp     uuid[] := ARRAY(SELECT jsonb_array_elements_text(p->'target_competitor_shop_ids')::uuid);
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Оценка охвата доступна только администратору';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles WHERE COALESCE(is_blocked, false) = false;

  SELECT count(*) INTO v_matched
    FROM public.profiles pr
   WHERE COALESCE(pr.is_blocked, false) = false
     AND (v_country IS NULL OR pr.country = v_country)
     AND (v_city    IS NULL OR pr.city    = v_city)
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
     AND (cardinality(v_subs) = 0 OR EXISTS (
           SELECT 1 FROM public.user_subscriptions s
            WHERE s.user_id = pr.user_id AND s.is_active
              AND s.subscription_type_id = ANY(v_subs)))
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
     AND (v_excl = 0 OR v_shop IS NULL OR NOT EXISTS (
           SELECT 1 FROM public.redemptions r
            WHERE r.user_id = pr.user_id AND r.shop_id = v_shop::text
              AND r.redeemed_at >= now() - make_interval(days => v_excl)))
     AND (cardinality(v_comp) = 0 OR EXISTS (
           SELECT 1 FROM public.redemptions r
            WHERE r.user_id = pr.user_id
              AND r.shop_id = ANY(SELECT unnest(v_comp)::text)
              AND r.redeemed_at >= now() - make_interval(days => GREATEST(v_bdays, 30))));

  RETURN jsonb_build_object('matched', v_matched, 'total', v_total);
END $fn$;

REVOKE ALL ON FUNCTION public.estimate_ad_reach(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.estimate_ad_reach(jsonb) TO authenticated;
