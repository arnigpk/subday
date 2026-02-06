-- Create stories table
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Enable Row Level Security
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view stories" 
ON public.stories 
FOR SELECT 
USING (expires_at > now());

CREATE POLICY "Users can create own stories" 
ON public.stories 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories" 
ON public.stories 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create story_views table
CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Create policies for story_views
CREATE POLICY "Anyone can view story views" 
ON public.story_views 
FOR SELECT 
USING (true);

CREATE POLICY "Users can mark story as viewed" 
ON public.story_views 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create story_likes table
CREATE TABLE public.story_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

-- Create policies for story_likes
CREATE POLICY "Anyone can view story likes" 
ON public.story_likes 
FOR SELECT 
USING (true);

CREATE POLICY "Users can like stories" 
ON public.story_likes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike stories" 
ON public.story_likes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;