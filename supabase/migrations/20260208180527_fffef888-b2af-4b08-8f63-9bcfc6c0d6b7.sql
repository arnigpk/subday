-- Add policy for admins to delete any subflow post
CREATE POLICY "Admins can delete any post"
ON public.subflow_posts
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));