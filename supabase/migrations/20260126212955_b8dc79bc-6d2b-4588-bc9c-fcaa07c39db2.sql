-- Add sort_order column to shops table
ALTER TABLE public.shops ADD COLUMN sort_order integer DEFAULT 0;

-- Add sort_order column to subscription_types table
ALTER TABLE public.subscription_types ADD COLUMN sort_order integer DEFAULT 0;

-- Initialize sort_order based on current created_at order for shops
WITH ordered_shops AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.shops
)
UPDATE public.shops s
SET sort_order = os.rn
FROM ordered_shops os
WHERE s.id = os.id;

-- Initialize sort_order based on current price order for subscription_types
WITH ordered_subs AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY price ASC) as rn
  FROM public.subscription_types
)
UPDATE public.subscription_types st
SET sort_order = os.rn
FROM ordered_subs os
WHERE st.id = os.id;