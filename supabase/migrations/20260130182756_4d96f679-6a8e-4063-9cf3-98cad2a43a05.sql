-- Add addresses array column to shops table
ALTER TABLE public.shops 
ADD COLUMN addresses text[] DEFAULT ARRAY[]::text[];

-- Migrate existing address to addresses array if not null
UPDATE public.shops 
SET addresses = ARRAY[address] 
WHERE address IS NOT NULL AND address != '';