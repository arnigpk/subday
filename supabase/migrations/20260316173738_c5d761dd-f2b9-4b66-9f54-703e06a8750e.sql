
-- Partners can view banner events for banners belonging to their shop
CREATE POLICY "Partners can view banner events for their shop"
ON public.ad_banner_events
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.ad_banners ab
    WHERE ab.id = ad_banner_events.banner_id
    AND ab.shop_id::text = get_staff_shop_id(auth.uid())
  )
);

-- Partners can view subflow ad events for ads belonging to their shop
CREATE POLICY "Partners can view ad events for their shop"
ON public.subflow_ad_events
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.subflow_ads sa
    WHERE sa.id = subflow_ad_events.ad_id
    AND sa.shop_id::text = get_staff_shop_id(auth.uid())
  )
);

-- Partners can view inactive banners for their shop
CREATE POLICY "Partners can view own shop banners"
ON public.ad_banners
FOR SELECT
TO public
USING (
  shop_id::text = get_staff_shop_id(auth.uid())
);

-- Partners can view inactive subflow ads for their shop
CREATE POLICY "Partners can view own shop subflow ads"
ON public.subflow_ads
FOR SELECT
TO public
USING (
  shop_id::text = get_staff_shop_id(auth.uid())
);
