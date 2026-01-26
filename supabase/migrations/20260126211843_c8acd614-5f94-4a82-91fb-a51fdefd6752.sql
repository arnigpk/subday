-- Add badge column to subscription_types table
ALTER TABLE public.subscription_types 
ADD COLUMN badge text DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.subscription_types.badge IS 'Optional badge text like Хит, Выгодно, Максимум';