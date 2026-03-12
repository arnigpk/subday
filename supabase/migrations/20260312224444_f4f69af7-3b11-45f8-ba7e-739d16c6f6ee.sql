
ALTER TABLE public.ad_banners ADD COLUMN IF NOT EXISTS audience_types text[] NOT NULL DEFAULT ARRAY['all']::text[];
ALTER TABLE public.subflow_ads ADD COLUMN IF NOT EXISTS audience_types text[] NOT NULL DEFAULT ARRAY['all']::text[];
