
-- Drop all existing RESTRICTIVE policies on subflow_ad_events
DROP POLICY IF EXISTS "Anyone can insert ad events" ON public.subflow_ad_events;
DROP POLICY IF EXISTS "Admins can view ad events" ON public.subflow_ad_events;
DROP POLICY IF EXISTS "Users can view own ad events" ON public.subflow_ad_events;
DROP POLICY IF EXISTS "Admins can delete ad events" ON public.subflow_ad_events;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Anyone can insert ad events"
  ON public.subflow_ad_events FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can view ad events"
  ON public.subflow_ad_events FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own ad events"
  ON public.subflow_ad_events FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete ad events"
  ON public.subflow_ad_events FOR DELETE
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
