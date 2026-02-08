-- Add external_url column to ad_banners
ALTER TABLE public.ad_banners 
ADD COLUMN external_url text;