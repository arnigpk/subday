-- Allow partners to update their own shop
CREATE POLICY "Partners can update their own shop" 
ON public.shops 
FOR UPDATE 
USING (
  id::text = get_staff_shop_id(auth.uid())
)
WITH CHECK (
  id::text = get_staff_shop_id(auth.uid())
);