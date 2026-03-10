CREATE POLICY "Admins can delete payment orders"
ON public.payment_orders
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role));