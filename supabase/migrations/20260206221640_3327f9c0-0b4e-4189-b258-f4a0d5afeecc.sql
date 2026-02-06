-- Add subflow_nickname column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subflow_nickname text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.subflow_nickname IS 'Nickname displayed in #subFlow social network';