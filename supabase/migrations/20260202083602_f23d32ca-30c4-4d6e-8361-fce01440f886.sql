-- Add daily_limit column to subscription_types table
-- Values: 2, 5, 7, 10, or NULL for unlimited
ALTER TABLE public.subscription_types
ADD COLUMN daily_limit integer DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.subscription_types.daily_limit IS 'Daily redemption limit. NULL means unlimited.';