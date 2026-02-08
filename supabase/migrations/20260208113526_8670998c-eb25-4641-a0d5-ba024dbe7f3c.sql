-- Add badge_color column to subscription_types table
ALTER TABLE public.subscription_types 
ADD COLUMN IF NOT EXISTS badge_color text DEFAULT NULL;