-- Снимок расчёта выплаты партнёру на МОМЕНТ списания.
-- Нужен, чтобы старые выплаты не менялись при смене цены/процента подписки
-- (или при создании новой подписки с тем же названием и другой ценой).
-- Заполняется в partner-scan-qr при создании списания. Старые списания = NULL
-- (для них расчёт остаётся по текущей логике — поиск по имени).
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS payout_price numeric,
  ADD COLUMN IF NOT EXISTS payout_cups integer,
  ADD COLUMN IF NOT EXISTS payout_percent numeric,
  -- Жёсткая привязка списания к КОНКРЕТНОМУ тарифу (по его id), чтобы название
  -- можно было переиспользовать точь-в-точь, а старые списания оставались за
  -- старым (архивированным) тарифом. Расчёт: снимок → по этому id → по имени.
  ADD COLUMN IF NOT EXISTS subscription_type_id uuid;
