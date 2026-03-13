
-- Create investor_settings table
CREATE TABLE public.investor_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  profit_percent numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investor_settings ENABLE ROW LEVEL SECURITY;

-- Investor can read own settings
CREATE POLICY "Investors can view own settings"
ON public.investor_settings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can manage all investor settings
CREATE POLICY "Admins can manage investor settings"
ON public.investor_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Add investor read access to subscription_transactions
CREATE POLICY "Investors can view all subscription transactions"
ON public.subscription_transactions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'investor'::app_role));

-- Add investor read access to user_subscriptions
CREATE POLICY "Investors can view all subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'investor'::app_role));
