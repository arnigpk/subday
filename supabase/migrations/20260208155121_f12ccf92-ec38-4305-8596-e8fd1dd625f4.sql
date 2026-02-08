-- Create ad_banners table for promotional banners
CREATE TABLE public.ad_banners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url text NOT NULL,
  caption text NULL,
  shop_id uuid NULL REFERENCES public.shops(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;

-- Anyone can view active banners
CREATE POLICY "Anyone can view active banners"
ON public.ad_banners
FOR SELECT
USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage banners
CREATE POLICY "Admins can manage banners"
ON public.ad_banners
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_ad_banners_updated_at
BEFORE UPDATE ON public.ad_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for ad banners
INSERT INTO storage.buckets (id, name, public) VALUES ('ad-banners', 'ad-banners', true);

-- Storage policies for ad banners
CREATE POLICY "Anyone can view ad banner images"
ON storage.objects FOR SELECT
USING (bucket_id = 'ad-banners');

CREATE POLICY "Admins can upload ad banner images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ad-banners' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ad banner images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'ad-banners' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ad banner images"
ON storage.objects FOR DELETE
USING (bucket_id = 'ad-banners' AND has_role(auth.uid(), 'admin'::app_role));