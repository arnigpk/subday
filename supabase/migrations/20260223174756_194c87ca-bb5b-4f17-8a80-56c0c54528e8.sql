
-- Special offers table for admin-managed offers
CREATE TABLE public.special_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  target_subscription_type_id uuid REFERENCES public.subscription_types(id),
  offer_price integer NOT NULL,
  offer_cups_count integer NOT NULL,
  offer_duration_days integer NOT NULL,
  badge_text text DEFAULT '-50%',
  eligibility_type text NOT NULL DEFAULT 'new_users', -- 'new_users', 'all_users', 'no_subscription'
  eligibility_days integer NOT NULL DEFAULT 7, -- days after registration
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.special_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage special offers" ON public.special_offers
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active special offers" ON public.special_offers
  FOR SELECT USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

-- Add special offer tracking fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN special_offer_popup_shown_at timestamptz,
  ADD COLUMN special_offer_redeemed_at timestamptz;

-- User-specific offer redemptions (tracks which offers each user has used)
CREATE TABLE public.user_offer_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES public.special_offers(id),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_offer_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions" ON public.user_offer_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage offer redemptions" ON public.user_offer_redemptions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add is_special_offer flag to subscription_transactions
ALTER TABLE public.subscription_transactions
  ADD COLUMN is_special_offer boolean DEFAULT false;

-- Insert the default special offer (subday Go -50%)
-- We need to find the subday Go subscription type id first, so we use a subquery
INSERT INTO public.special_offers (name, description, target_subscription_type_id, offer_price, offer_cups_count, offer_duration_days, badge_text, eligibility_type, eligibility_days, is_active)
SELECT 
  'Спецпредложение для новых пользователей',
  '7 кофе за 7 500 ₸ — чтобы вы попробовали subday',
  id,
  7500,
  7,
  7,
  '-50%',
  'new_users',
  7,
  true
FROM public.subscription_types 
WHERE name ILIKE '%subday Go%' AND type = 'coffee'
LIMIT 1;
