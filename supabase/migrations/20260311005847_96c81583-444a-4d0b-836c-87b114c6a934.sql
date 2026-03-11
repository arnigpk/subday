
-- Create subflow_ad_events table for tracking views and clicks
CREATE TABLE public.subflow_ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.subflow_ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL, -- 'view' or 'click'
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add daily_limit column to subflow_ads
ALTER TABLE public.subflow_ads ADD COLUMN daily_limit integer NOT NULL DEFAULT 0;

-- Enable RLS
ALTER TABLE public.subflow_ad_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (tracking)
CREATE POLICY "Anyone can insert ad events" ON public.subflow_ad_events
  FOR INSERT WITH CHECK (true);

-- Admins can view all events
CREATE POLICY "Admins can view ad events" ON public.subflow_ad_events
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete events
CREATE POLICY "Admins can delete ad events" ON public.subflow_ad_events
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view own events (needed for daily limit check)
CREATE POLICY "Users can view own ad events" ON public.subflow_ad_events
  FOR SELECT USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_subflow_ad_events_ad_id ON public.subflow_ad_events(ad_id);
CREATE INDEX idx_subflow_ad_events_user_date ON public.subflow_ad_events(user_id, created_at);
