-- Create a function to get global shop visit counts (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_shop_visit_counts()
RETURNS TABLE(shop_id text, visit_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.shop_id, COUNT(*) as visit_count
  FROM public.redemptions r
  WHERE r.shop_id IS NOT NULL
  GROUP BY r.shop_id
$$;