-- Add badge columns to shops table
ALTER TABLE public.shops 
ADD COLUMN badge_text text DEFAULT NULL,
ADD COLUMN badge_color text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.shops.badge_text IS 'Short badge text for shop (e.g., "Новинка", "Акция")';
COMMENT ON COLUMN public.shops.badge_color IS 'Badge color: red, green, or yellow';