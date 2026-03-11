
-- Add scheduling columns to subflow_ads
ALTER TABLE public.subflow_ads
  ADD COLUMN IF NOT EXISTS starts_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ends_at timestamp with time zone DEFAULT NULL;

-- Add scheduling columns to ad_banners
ALTER TABLE public.ad_banners
  ADD COLUMN IF NOT EXISTS starts_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ends_at timestamp with time zone DEFAULT NULL;
