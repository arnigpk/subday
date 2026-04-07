
-- Fix: Allow users with subflow_access to upload to subflow-images bucket
DROP POLICY IF EXISTS "Subscribers can upload subflow images" ON storage.objects;

CREATE POLICY "Subscribers can upload subflow images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'subflow-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (
    EXISTS (
      SELECT 1 FROM user_subscriptions
      WHERE user_subscriptions.user_id = auth.uid()
      AND user_subscriptions.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.subflow_access = true
    )
  )
);
