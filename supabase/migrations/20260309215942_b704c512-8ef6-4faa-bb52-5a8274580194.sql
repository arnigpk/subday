-- Add unique constraint to prevent duplicate reactions (same user, same post, same reaction)
-- First remove any existing duplicates
DELETE FROM public.subflow_reactions a
USING public.subflow_reactions b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.post_id = b.post_id
  AND a.reaction = b.reaction;

ALTER TABLE public.subflow_reactions 
ADD CONSTRAINT subflow_reactions_unique_user_post_reaction 
UNIQUE (user_id, post_id, reaction);