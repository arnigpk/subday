-- Add image_urls column for multiple images support
ALTER TABLE public.subflow_posts 
ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT ARRAY[]::text[];