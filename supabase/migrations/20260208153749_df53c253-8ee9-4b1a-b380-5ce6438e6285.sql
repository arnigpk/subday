-- Add gallery_urls column to shops table for photo gallery
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT ARRAY[]::text[];