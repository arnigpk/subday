-- Replace broad SELECT policies with owner-scoped ones to block listing.
-- Public CDN access via /object/public/<bucket>/<path> is unaffected by storage.objects RLS.

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read shop-logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read subflow-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read ad-banners" ON storage.objects;
DROP POLICY IF EXISTS "Public read app-assets" ON storage.objects;

-- AVATARS: owner or admin can list/select via API
CREATE POLICY "Owner/admin list avatars"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- SUBFLOW-IMAGES: owner or admin
CREATE POLICY "Owner/admin list subflow media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'subflow-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- SHOP-LOGOS: admin or staff of that shop
CREATE POLICY "Admin/staff list shop logos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

-- AD-BANNERS: admin only listing
CREATE POLICY "Admin list ad banners"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'ad-banners'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- APP-ASSETS: admin only listing
CREATE POLICY "Admin list app assets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'app-assets'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);