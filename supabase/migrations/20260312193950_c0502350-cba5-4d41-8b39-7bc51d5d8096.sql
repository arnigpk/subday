
-- Automatically delete notifications when a post is deleted
CREATE OR REPLACE FUNCTION public.cleanup_post_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.subflow_notifications WHERE post_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cleanup_post_notifications
  BEFORE DELETE ON public.subflow_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_post_notifications();
