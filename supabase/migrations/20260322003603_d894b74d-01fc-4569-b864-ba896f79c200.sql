
-- Table for admin messages
CREATE TABLE public.app_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  audience_types TEXT[] NOT NULL DEFAULT ARRAY['all'::text],
  frequency_type TEXT NOT NULL DEFAULT 'once',
  daily_frequency INTEGER NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for tracking dismissals
CREATE TABLE public.app_message_dismissals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.app_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dismiss_date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(message_id, user_id, dismiss_date)
);

-- RLS for app_messages
ALTER TABLE public.app_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage messages" ON public.app_messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active messages" ON public.app_messages
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS for app_message_dismissals
ALTER TABLE public.app_message_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dismissals" ON public.app_message_dismissals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dismissals" ON public.app_message_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage dismissals" ON public.app_message_dismissals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
