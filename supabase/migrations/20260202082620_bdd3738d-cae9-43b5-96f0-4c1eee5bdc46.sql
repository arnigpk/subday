-- Add benefit column to subscription_types for custom savings display
ALTER TABLE public.subscription_types
ADD COLUMN IF NOT EXISTS benefit integer DEFAULT NULL;