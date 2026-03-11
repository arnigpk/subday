
-- Add user_id column to push_notifications (nullable: null = broadcast to all)
ALTER TABLE public.push_notifications ADD COLUMN user_id uuid DEFAULT NULL;

-- Drop old policies
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.push_notifications;
DROP POLICY IF EXISTS "Anyone can read notifications" ON public.push_notifications;

-- New policies: admins can insert, users see their own + broadcasts (user_id IS NULL)
CREATE POLICY "Admins and service can insert push notifications"
ON public.push_notifications FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Users can read own and broadcast notifications"
ON public.push_notifications FOR SELECT
TO public
USING (user_id IS NULL OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
