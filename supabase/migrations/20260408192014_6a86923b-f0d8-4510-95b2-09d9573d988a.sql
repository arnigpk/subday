
-- Add preorders_enabled to shops
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS preorders_enabled boolean NOT NULL DEFAULT false;

-- Create preorders table
CREATE TABLE public.preorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  shop_name text NOT NULL,
  coffee_name text NOT NULL,
  syrup text,
  status text NOT NULL DEFAULT 'new',
  qr_code text NOT NULL DEFAULT gen_random_uuid()::text,
  completed_by uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.preorders ENABLE ROW LEVEL SECURITY;

-- Users can create their own preorders
CREATE POLICY "Users can create own preorders"
ON public.preorders FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own preorders
CREATE POLICY "Users can view own preorders"
ON public.preorders FOR SELECT
USING (auth.uid() = user_id);

-- Staff can view preorders for their shop
CREATE POLICY "Staff can view shop preorders"
ON public.preorders FOR SELECT
USING (
  (shop_id)::text = get_staff_shop_id(auth.uid())
);

-- Staff can update preorders for their shop (mark as completed)
CREATE POLICY "Staff can update shop preorders"
ON public.preorders FOR UPDATE
USING (
  (shop_id)::text = get_staff_shop_id(auth.uid())
);

-- Admins full access
CREATE POLICY "Admins can manage preorders"
ON public.preorders FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.preorders;

-- Index for fast lookups
CREATE INDEX idx_preorders_shop_status ON public.preorders (shop_id, status);
CREATE INDEX idx_preorders_user ON public.preorders (user_id);
CREATE INDEX idx_preorders_qr ON public.preorders (qr_code);
