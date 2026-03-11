
-- Drop the old INSERT policy that only checks subscriptions
DROP POLICY IF EXISTS "Subscribers can create posts" ON public.subflow_posts;

-- Create new INSERT policy that also allows users with subflow_access
CREATE POLICY "Subscribers or subflow_access can create posts"
ON public.subflow_posts
FOR INSERT
TO public
WITH CHECK (
  (auth.uid() = user_id) AND (
    EXISTS (
      SELECT 1 FROM user_subscriptions
      WHERE user_subscriptions.user_id = auth.uid() AND user_subscriptions.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.subflow_access = true
    )
  )
);
