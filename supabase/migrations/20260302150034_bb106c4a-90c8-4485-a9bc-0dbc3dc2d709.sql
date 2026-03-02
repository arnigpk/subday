
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS country text DEFAULT 'KZ';

ALTER TABLE public.ad_banners ADD COLUMN IF NOT EXISTS country text DEFAULT NULL;
ALTER TABLE public.ad_banners ADD COLUMN IF NOT EXISTS city text DEFAULT NULL;

ALTER TABLE public.special_offers ADD COLUMN IF NOT EXISTS country text DEFAULT NULL;

ALTER TABLE public.subscription_types ADD COLUMN IF NOT EXISTS country text DEFAULT 'KZ';
ALTER TABLE public.subscription_types ADD COLUMN IF NOT EXISTS currency text DEFAULT '₸';
