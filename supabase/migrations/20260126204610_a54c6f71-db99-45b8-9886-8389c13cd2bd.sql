-- Add logo_url column to shops table
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for shop logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('shop-logos', 'shop-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view shop logos
CREATE POLICY "Anyone can view shop logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-logos');

-- Allow admins to upload shop logos
CREATE POLICY "Admins can upload shop logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'shop-logos' AND has_role(auth.uid(), 'admin'));

-- Allow admins to update shop logos
CREATE POLICY "Admins can update shop logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'shop-logos' AND has_role(auth.uid(), 'admin'));

-- Allow admins to delete shop logos
CREATE POLICY "Admins can delete shop logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'shop-logos' AND has_role(auth.uid(), 'admin'));