-- Create table for banner statistics
CREATE TABLE public.ad_banner_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  banner_id uuid NOT NULL REFERENCES public.ad_banners(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'click')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for faster aggregation
CREATE INDEX idx_banner_events_banner_id ON public.ad_banner_events(banner_id);
CREATE INDEX idx_banner_events_type ON public.ad_banner_events(event_type);

-- Enable RLS
ALTER TABLE public.ad_banner_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (for tracking)
CREATE POLICY "Anyone can insert banner events"
ON public.ad_banner_events
FOR INSERT
WITH CHECK (true);

-- Admins can view all events
CREATE POLICY "Admins can view banner events"
ON public.ad_banner_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete events
CREATE POLICY "Admins can delete banner events"
ON public.ad_banner_events
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));