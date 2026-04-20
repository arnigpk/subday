-- Drop existing object policies that might be too permissive
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END$$;

-- ===== READ (public direct URL access remains via storage.objects SELECT) =====
-- Allow direct file reads for public buckets (object-level), but block listing via storage.objects from API
CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Public read shop-logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-logos');

CREATE POLICY "Public read subflow-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'subflow-images');

CREATE POLICY "Public read ad-banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'ad-banners');

CREATE POLICY "Public read app-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-assets');

-- ===== AVATARS: user-scoped folder =====
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ===== SUBFLOW-IMAGES: user-scoped folder =====
CREATE POLICY "Users upload own subflow media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'subflow-images'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own subflow media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'subflow-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own subflow media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'subflow-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- ===== SHOP-LOGOS: admins or partner/barista of that shop =====
CREATE POLICY "Admins or shop staff upload shop logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'shop-logos'
  AND auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

CREATE POLICY "Admins or shop staff update shop logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

CREATE POLICY "Admins or shop staff delete shop logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

-- ===== AD-BANNERS: admin-only writes =====
CREATE POLICY "Admins upload ad banners"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ad-banners'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins update ad banners"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ad-banners'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins delete ad banners"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ad-banners'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- ===== APP-ASSETS: admin-only writes =====
CREATE POLICY "Admins upload app assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'app-assets'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins update app assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'app-assets'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins delete app assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'app-assets'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);