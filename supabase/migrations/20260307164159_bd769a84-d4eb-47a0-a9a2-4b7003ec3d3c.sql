INSERT INTO storage.buckets (id, name, public) VALUES ('app-assets', 'app-assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view app assets" ON storage.objects FOR SELECT USING (bucket_id = 'app-assets');

CREATE POLICY "Admins can manage app assets" ON storage.objects FOR ALL USING (
  bucket_id = 'app-assets' AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
) WITH CHECK (
  bucket_id = 'app-assets' AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
);