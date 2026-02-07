-- Add latitude and longitude columns to shops table for distance calculation
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add index for faster geospatial queries
CREATE INDEX IF NOT EXISTS idx_shops_coordinates ON public.shops (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;