
-- Table for tracking message views (every view, including repeats)
CREATE TABLE public.app_message_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.app_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for tracking unique views (1 per user per message)
CREATE TABLE public.app_message_unique_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.app_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  first_viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- RLS for app_message_views
ALTER TABLE public.app_message_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own views" ON public.app_message_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all message views" ON public.app_message_views
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete message views" ON public.app_message_views
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS for app_message_unique_views
ALTER TABLE public.app_message_unique_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own unique views" ON public.app_message_unique_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all unique views" ON public.app_message_unique_views
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete unique views" ON public.app_message_unique_views
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
