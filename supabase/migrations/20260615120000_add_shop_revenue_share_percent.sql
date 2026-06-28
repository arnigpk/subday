-- Per-shop revenue share percentage for partner payouts (70% or 80%)
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS revenue_share_percent integer NOT NULL DEFAULT 70
  CHECK (revenue_share_percent IN (70, 80));
