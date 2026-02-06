-- Add amount column to subscription_transactions if not exists
ALTER TABLE public.subscription_transactions
ADD COLUMN IF NOT EXISTS amount INTEGER;