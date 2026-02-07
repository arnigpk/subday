-- Add columns for multiple badges support
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS badges jsonb DEFAULT '[]'::jsonb;

-- Migrate existing single badge to new badges array format
UPDATE public.shops 
SET badges = jsonb_build_array(
  jsonb_build_object('text', badge_text, 'color', badge_color)
)
WHERE badge_text IS NOT NULL AND badge_color IS NOT NULL AND badges = '[]'::jsonb;