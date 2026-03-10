
-- 1. Clean up violations: keep only the 2 oldest reactions per user per post, delete the rest
DELETE FROM public.subflow_reactions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, post_id ORDER BY created_at ASC) as rn
    FROM public.subflow_reactions
  ) ranked
  WHERE rn > 2
);

-- 2. Create a trigger function to enforce max 2 reactions per user per post
CREATE OR REPLACE FUNCTION public.enforce_max_reactions_per_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(*) INTO reaction_count
  FROM public.subflow_reactions
  WHERE user_id = NEW.user_id AND post_id = NEW.post_id;

  IF reaction_count >= 2 THEN
    RAISE EXCEPTION 'Maximum 2 reactions per user per post allowed';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create the trigger
CREATE TRIGGER check_max_reactions
  BEFORE INSERT ON public.subflow_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_reactions_per_user();
