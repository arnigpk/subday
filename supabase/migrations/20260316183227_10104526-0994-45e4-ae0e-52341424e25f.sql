
CREATE OR REPLACE FUNCTION public.get_subflow_ad_analytics(
  _shop_id uuid DEFAULT NULL,
  _from timestamp with time zone DEFAULT NULL,
  _to timestamp with time zone DEFAULT NULL,
  _country text DEFAULT NULL,
  _city text DEFAULT NULL
)
RETURNS TABLE(ad_id uuid, views bigint, clicks bigint, reactions bigint, comments bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH authorized AS (
    SELECT (
      auth.uid() IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          _shop_id IS NOT NULL
          AND _shop_id::text = public.get_staff_shop_id(auth.uid())
        )
      )
    ) AS ok
  ),
  scoped_ads AS (
    SELECT sa.id
    FROM public.subflow_ads sa
    WHERE (_shop_id IS NULL OR sa.shop_id = _shop_id)
  ),
  filtered_users AS (
    SELECT p.user_id
    FROM public.profiles p
    WHERE (_country IS NULL OR p.country = _country)
      AND (_city IS NULL OR p.city = _city)
  ),
  event_totals AS (
    SELECT
      e.ad_id,
      COUNT(*) FILTER (WHERE e.event_type = 'view') AS views,
      COUNT(*) FILTER (WHERE e.event_type = 'click') AS clicks
    FROM public.subflow_ad_events e
    INNER JOIN scoped_ads sa ON sa.id = e.ad_id
    WHERE (_from IS NULL OR e.created_at >= _from)
      AND (_to IS NULL OR e.created_at <= _to)
      AND (_country IS NULL OR e.user_id IN (SELECT fu.user_id FROM filtered_users fu))
    GROUP BY e.ad_id
  ),
  reaction_totals AS (
    SELECT
      r.ad_id,
      COUNT(*) AS reactions
    FROM public.subflow_ad_reactions r
    INNER JOIN scoped_ads sa ON sa.id = r.ad_id
    WHERE (_from IS NULL OR r.created_at >= _from)
      AND (_to IS NULL OR r.created_at <= _to)
      AND (_country IS NULL OR r.user_id IN (SELECT fu.user_id FROM filtered_users fu))
    GROUP BY r.ad_id
  ),
  comment_totals AS (
    SELECT
      c.ad_id,
      COUNT(*) AS comments
    FROM public.subflow_ad_comments c
    INNER JOIN scoped_ads sa ON sa.id = c.ad_id
    WHERE (_from IS NULL OR c.created_at >= _from)
      AND (_to IS NULL OR c.created_at <= _to)
      AND (_country IS NULL OR c.user_id IN (SELECT fu.user_id FROM filtered_users fu))
    GROUP BY c.ad_id
  )
  SELECT
    sa.id AS ad_id,
    COALESCE(et.views, 0) AS views,
    COALESCE(et.clicks, 0) AS clicks,
    COALESCE(rt.reactions, 0) AS reactions,
    COALESCE(ct.comments, 0) AS comments
  FROM scoped_ads sa
  LEFT JOIN event_totals et ON et.ad_id = sa.id
  LEFT JOIN reaction_totals rt ON rt.ad_id = sa.id
  LEFT JOIN comment_totals ct ON ct.ad_id = sa.id
  WHERE (SELECT ok FROM authorized);
$$;
