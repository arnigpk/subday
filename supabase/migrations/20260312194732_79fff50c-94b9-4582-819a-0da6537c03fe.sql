CREATE OR REPLACE FUNCTION public.cleanup_post_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.subflow_notifications WHERE post_id = OLD.id;
  DELETE FROM public.subflow_reactions WHERE post_id = OLD.id;
  DELETE FROM public.subflow_comments WHERE post_id = OLD.id;
  RETURN OLD;
END;
$$;