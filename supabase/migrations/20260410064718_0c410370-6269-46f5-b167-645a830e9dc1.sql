
-- Add qr_scanned flag and cancelled_at to preorders
ALTER TABLE public.preorders ADD COLUMN IF NOT EXISTS qr_scanned boolean NOT NULL DEFAULT false;
ALTER TABLE public.preorders ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

-- Allow users to update their own preorders (for cancellation)
CREATE POLICY "Users can update own preorders"
ON public.preorders
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
