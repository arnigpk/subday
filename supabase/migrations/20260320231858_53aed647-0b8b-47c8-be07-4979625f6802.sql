CREATE OR REPLACE FUNCTION public.prevent_superadmin_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role = 'superadmin' AND OLD.user_id = '31a2aba4-9ea6-40de-b4d1-f2013605107b'::uuid THEN
    RAISE EXCEPTION 'Cannot delete primary superadmin role';
  END IF;
  RETURN OLD;
END;
$function$;