-- Replace single lat/lng with array of coordinates per address
-- Each element is a JSON object {lat, lng} matching the addresses array index
ALTER TABLE public.shops DROP COLUMN IF EXISTS latitude;
ALTER TABLE public.shops DROP COLUMN IF EXISTS longitude;
ALTER TABLE public.shops ADD COLUMN coordinates JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.shops.coordinates IS 'Array of {lat, lng} objects, one per address in the addresses array';