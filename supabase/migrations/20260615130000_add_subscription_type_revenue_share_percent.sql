-- Per-subscription-type revenue share override (70% or 80%), NULL = inherit from shop setting
ALTER TABLE public.subscription_types
  ADD COLUMN IF NOT EXISTS revenue_share_percent integer NULL DEFAULT NULL
  CHECK (revenue_share_percent IS NULL OR revenue_share_percent IN (70, 80));
