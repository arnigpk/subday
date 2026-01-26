-- Create function to get shop_id for partner or barista
CREATE OR REPLACE FUNCTION public.get_staff_shop_id(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT shop_id FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('partner', 'barista')
  LIMIT 1
$$;

-- Update RLS policy for redemptions to allow baristas and partners to view their shop's redemptions
DROP POLICY IF EXISTS "Admins can view all redemptions" ON public.redemptions;

CREATE POLICY "Users and staff can view redemptions" ON public.redemptions
FOR SELECT USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'moderator')
  OR (has_role(auth.uid(), 'partner') AND shop_id = get_staff_shop_id(auth.uid()))
  OR (has_role(auth.uid(), 'barista') AND shop_id = get_staff_shop_id(auth.uid()))
);

-- Allow partners to manage baristas (view user_roles for their shop)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins and partners can view roles" ON public.user_roles
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
  OR (has_role(auth.uid(), 'partner') AND shop_id = get_staff_shop_id(auth.uid()))
  OR user_id = auth.uid()
);

-- Allow partners to add/remove baristas for their shop
CREATE POLICY "Partners can manage baristas for their shop" ON public.user_roles
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'partner') 
  AND role = 'barista' 
  AND shop_id = get_staff_shop_id(auth.uid())
);

CREATE POLICY "Partners can delete baristas from their shop" ON public.user_roles
FOR DELETE USING (
  has_role(auth.uid(), 'partner') 
  AND role = 'barista' 
  AND shop_id = get_staff_shop_id(auth.uid())
);

-- Allow partners and baristas to view profiles for their shop's customers
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Staff can view customer profiles" ON public.profiles
FOR SELECT USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'moderator')
  OR has_role(auth.uid(), 'partner')
  OR has_role(auth.uid(), 'barista')
);