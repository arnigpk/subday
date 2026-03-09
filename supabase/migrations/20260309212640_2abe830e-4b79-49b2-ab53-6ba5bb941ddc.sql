
-- Table: subflow_follows
CREATE TABLE public.subflow_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

ALTER TABLE public.subflow_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own follows" ON public.subflow_follows
  FOR SELECT USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE POLICY "Users can follow" ON public.subflow_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow" ON public.subflow_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Table: subflow_notifications
CREATE TABLE public.subflow_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  type text NOT NULL,
  post_id uuid REFERENCES public.subflow_posts(id) ON DELETE CASCADE,
  reaction text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subflow_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.subflow_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.subflow_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service can insert notifications" ON public.subflow_notifications
  FOR INSERT WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.subflow_notifications;

-- Indexes
CREATE INDEX idx_subflow_follows_follower ON public.subflow_follows(follower_id);
CREATE INDEX idx_subflow_follows_following ON public.subflow_follows(following_id);
CREATE INDEX idx_subflow_notifications_user ON public.subflow_notifications(user_id, is_read, created_at DESC);
