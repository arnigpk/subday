-- Add autoplay_delay column to ad_banners table (in seconds)
ALTER TABLE public.ad_banners 
ADD COLUMN autoplay_delay integer NOT NULL DEFAULT 4;