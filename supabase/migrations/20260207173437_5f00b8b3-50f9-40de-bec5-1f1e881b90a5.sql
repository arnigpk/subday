
-- Drop old constraint and create new one with correct reactions
ALTER TABLE public.subflow_reactions 
DROP CONSTRAINT IF EXISTS subflow_reactions_reaction_check;

ALTER TABLE public.subflow_reactions 
ADD CONSTRAINT subflow_reactions_reaction_check 
CHECK (reaction = ANY (ARRAY['💚', '👍', '🔥', '🚀', '⚡️']));
