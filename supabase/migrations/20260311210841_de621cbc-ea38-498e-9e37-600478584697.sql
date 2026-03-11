
-- 2. Update has_role to make superadmin pass admin checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND (
      role = _role
      OR (_role = 'admin' AND role = 'superadmin')
    )
  )
$$;

-- 3. Trigger to prevent deletion of superadmin roles
CREATE OR REPLACE FUNCTION public.prevent_superadmin_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role = 'superadmin' THEN
    RAISE EXCEPTION 'Cannot delete superadmin role';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_superadmin_delete ON public.user_roles;
CREATE TRIGGER prevent_superadmin_delete
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_superadmin_deletion();
