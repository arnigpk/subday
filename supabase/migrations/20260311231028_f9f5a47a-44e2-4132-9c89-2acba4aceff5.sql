
-- Create ad reactions table
CREATE TABLE public.subflow_ad_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id uuid NOT NULL REFERENCES public.subflow_ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_id, reaction)
);

-- Create ad comments table
CREATE TABLE public.subflow_ad_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id uuid NOT NULL REFERENCES public.subflow_ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subflow_ad_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subflow_ad_comments ENABLE ROW LEVEL SECURITY;

-- Ad reactions RLS
CREATE POLICY "Anyone can view ad reactions" ON public.subflow_ad_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add ad reactions" ON public.subflow_ad_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own ad reactions" ON public.subflow_ad_reactions FOR DELETE USING (auth.uid() = user_id);

-- Ad comments RLS
CREATE POLICY "Anyone can view ad comments" ON public.subflow_ad_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment on ads" ON public.subflow_ad_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own ad comments" ON public.subflow_ad_comments FOR DELETE USING (auth.uid() = user_id);

-- Trigger: max 2 reactions per user per ad
CREATE OR REPLACE FUNCTION public.enforce_max_ad_reactions_per_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(*) INTO reaction_count
  FROM public.subflow_ad_reactions
  WHERE user_id = NEW.user_id AND ad_id = NEW.ad_id;

  IF reaction_count >= 2 THEN
    RAISE EXCEPTION 'Maximum 2 reactions per user per ad allowed';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER enforce_max_ad_reactions
  BEFORE INSERT ON public.subflow_ad_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_ad_reactions_per_user();

-- Enable realtime for ad comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.subflow_ad_comments;
