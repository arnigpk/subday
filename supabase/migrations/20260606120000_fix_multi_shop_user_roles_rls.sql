-- Fix RLS policies for user_roles to support partners with multiple shops.
-- Root cause: get_staff_shop_id() returns LIMIT 1, so partners with 2+ shops
-- could only manage baristas for their first shop.

DROP POLICY IF EXISTS "Partners can manage baristas for their shop" ON public.user_roles;
DROP POLICY IF EXISTS "Partners can delete baristas from their shop" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and partners can view roles" ON public.user_roles;

-- INSERT: partner can add a barista only to a shop they own
CREATE POLICY "Partners can manage baristas for their shop" ON public.user_roles
FOR INSERT WITH CHECK (
  role = 'barista'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'partner'
      AND ur.shop_id = shop_id
  )
);

-- DELETE: partner can remove a barista only from a shop they own
CREATE POLICY "Partners can delete baristas from their shop" ON public.user_roles
FOR DELETE USING (
  role = 'barista'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'partner'
      AND ur.shop_id = shop_id
  )
);

-- SELECT: admins see all, partners see their own shops, users see own row
CREATE POLICY "Admins and partners can view roles" ON public.user_roles
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'partner'
      AND ur.shop_id = shop_id
  )
  OR user_id = auth.uid()
);
