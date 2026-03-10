-- Allow admins to delete redemptions
CREATE POLICY "Admins can delete redemptions"
ON public.redemptions
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role));
