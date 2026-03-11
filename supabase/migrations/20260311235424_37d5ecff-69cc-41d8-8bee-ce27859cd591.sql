CREATE POLICY "Admins can delete push notifications"
ON public.push_notifications
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))