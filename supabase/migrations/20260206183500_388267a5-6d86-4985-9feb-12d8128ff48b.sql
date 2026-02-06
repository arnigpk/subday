-- Create subflow_posts table
CREATE TABLE public.subflow_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  image_url text,
  shop_id uuid REFERENCES public.shops(id),
  shop_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create subflow_reactions table
CREATE TABLE public.subflow_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.subflow_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('🚀', '🔥', '⚡️', '👍', '🥹')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, reaction)
);

-- Create subflow_comments table
CREATE TABLE public.subflow_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.subflow_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subflow_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subflow_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subflow_comments ENABLE ROW LEVEL SECURITY;

-- Posts policies: everyone can view, only subscribers can create
CREATE POLICY "Anyone can view posts"
ON public.subflow_posts FOR SELECT
USING (true);

CREATE POLICY "Subscribers can create posts"
ON public.subflow_posts FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Users can update own posts"
ON public.subflow_posts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
ON public.subflow_posts FOR DELETE
USING (auth.uid() = user_id);

-- Reactions policies: everyone can react
CREATE POLICY "Anyone can view reactions"
ON public.subflow_reactions FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can add reactions"
ON public.subflow_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions"
ON public.subflow_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Comments policies: everyone can comment
CREATE POLICY "Anyone can view comments"
ON public.subflow_comments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can comment"
ON public.subflow_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON public.subflow_comments FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for post images
INSERT INTO storage.buckets (id, name, public) VALUES ('subflow-images', 'subflow-images', true);

-- Storage policies
CREATE POLICY "Anyone can view subflow images"
ON storage.objects FOR SELECT
USING (bucket_id = 'subflow-images');

CREATE POLICY "Subscribers can upload subflow images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'subflow-images' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Users can delete own subflow images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'subflow-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Enable realtime for posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.subflow_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subflow_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subflow_comments;