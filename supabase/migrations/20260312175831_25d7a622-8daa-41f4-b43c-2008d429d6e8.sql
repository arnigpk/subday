CREATE POLICY "Users can delete own notifications"
ON public.subflow_notifications
FOR DELETE
TO public
USING (auth.uid() = user_id);