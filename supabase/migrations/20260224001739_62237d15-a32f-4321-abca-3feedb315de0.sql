
-- Add column to track which offers' popups have been shown to a user
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS popup_shown_offer_ids text[] DEFAULT ARRAY[]::text[];

-- Add expiring_soon eligibility type support (no schema change needed, just a new value in eligibility_type text field)
-- We just need to use 'expiring_soon' as a value
