-- Admins and moderators could not see payment_orders of other users because
-- only a per-owner SELECT policy existed. This adds an explicit admin SELECT
-- policy so all payment attempts are visible in the admin panel.

CREATE POLICY "Admins can view all payment orders"
ON public.payment_orders
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);
