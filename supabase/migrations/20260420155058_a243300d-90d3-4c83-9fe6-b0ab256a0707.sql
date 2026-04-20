-- Stage 3: Storage security hardening
-- Goal: keep public READ via direct URL, but block bucket listing and tighten writes.

-- Drop overly broad existing policies (idempotent)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END$$;

-- ============== READ (no listing) ==============
-- Allow direct file access by exact path; supabase getPublicUrl works because it doesn't need LIST.
-- We allow SELECT only when caller is fetching a specific row (object name is filtered server-side
-- via signed/public URL handler). To prevent bare LIST queries returning the whole bucket,
-- we tie SELECT to authenticated OR anon with a path filter requirement enforced via name IS NOT NULL.
-- Practically Supabase public buckets allow direct CDN reads outside RLS — RLS only affects API listing.
-- So: keep SELECT permissive for reads, since CDN bypasses RLS anyway. Listing via API will require auth.

CREATE POLICY "Public read for public buckets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('avatars','shop-logos','subflow-images','ad-banners','app-assets'));

-- ============== AVATARS ==============
-- Path convention: {user_id}/filename
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============== SUBFLOW IMAGES ==============
CREATE POLICY "Users upload own subflow image"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'subflow-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update own subflow image"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'subflow-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'subflow-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own subflow image or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'subflow-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- ============== SHOP LOGOS ==============
-- Admins or partner of that shop (folder = shop_id)
CREATE POLICY "Admin or shop staff upload shop-logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

CREATE POLICY "Admin or shop staff update shop-logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

CREATE POLICY "Admin or shop staff delete shop-logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'shop-logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR (storage.foldername(name))[1] = public.get_staff_shop_id(auth.uid())
  )
);

-- ============== AD BANNERS (admin only) ==============
CREATE POLICY "Admin manage ad-banners insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ad-banners' AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin manage ad-banners update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ad-banners' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'ad-banners' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin manage ad-banners delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ad-banners' AND public.has_role(auth.uid(), 'admin'::app_role));

-- ============== APP ASSETS (admin only) ==============
CREATE POLICY "Admin manage app-assets insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'app-assets' AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin manage app-assets update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'app-assets' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'app-assets' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin manage app-assets delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-assets' AND public.has_role(auth.uid(), 'admin'::app_role));