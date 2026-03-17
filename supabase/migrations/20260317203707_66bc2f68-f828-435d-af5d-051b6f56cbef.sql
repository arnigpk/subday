CREATE POLICY "Subscribers can upload story images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'subflow-images'
  AND (storage.foldername(name))[1] = 'stories'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND (
    EXISTS (
      SELECT 1 FROM user_subscriptions
      WHERE user_subscriptions.user_id = auth.uid() AND user_subscriptions.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.subflow_access = true
    )
  )
);