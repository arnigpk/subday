-- Add display_location field to ad_banners table
ALTER TABLE public.ad_banners 
ADD COLUMN display_location text NOT NULL DEFAULT 'shops';

-- Add comment for documentation
COMMENT ON COLUMN public.ad_banners.display_location IS 'Where to display the banner: home, shops, or both';