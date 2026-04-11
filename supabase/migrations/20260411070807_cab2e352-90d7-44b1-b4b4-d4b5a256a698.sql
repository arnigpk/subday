
-- Add shop_address to preorders for branch-level tracking
ALTER TABLE public.preorders ADD COLUMN IF NOT EXISTS shop_address text;

-- Create barista_shifts table to track which address a barista is currently working at
CREATE TABLE IF NOT EXISTS public.barista_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  address text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one active shift per user
CREATE UNIQUE INDEX IF NOT EXISTS barista_shifts_user_id_unique ON public.barista_shifts (user_id);

-- Enable RLS
ALTER TABLE public.barista_shifts ENABLE ROW LEVEL SECURITY;

-- Baristas/partners can view their own shift
CREATE POLICY "Users can view own shift"
ON public.barista_shifts
FOR SELECT
USING (auth.uid() = user_id);

-- Baristas/partners can insert their own shift
CREATE POLICY "Users can insert own shift"
ON public.barista_shifts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Baristas/partners can update their own shift
CREATE POLICY "Users can update own shift"
ON public.barista_shifts
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Baristas/partners can delete their own shift
CREATE POLICY "Users can delete own shift"
ON public.barista_shifts
FOR DELETE
USING (auth.uid() = user_id);

-- Staff can view shifts for their shop
CREATE POLICY "Staff can view shop shifts"
ON public.barista_shifts
FOR SELECT
USING ((shop_id)::text = get_staff_shop_id(auth.uid()));

-- Admins can manage all shifts
CREATE POLICY "Admins can manage shifts"
ON public.barista_shifts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
