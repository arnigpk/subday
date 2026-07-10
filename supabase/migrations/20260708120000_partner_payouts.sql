-- Учёт факта выплат партнёрам. Выплаты 2 раза в месяц:
--   half=1 → период 1–15 (платим 16–17 числа)
--   half=2 → период 16–конец (платим 1–2 числа следующего месяца)
-- Наличие строки = выплата отмечена как сделанная. Отметка снимается удалением строки.
CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL,                       -- 1..12 (месяц ПЕРИОДА)
  half int NOT NULL CHECK (half IN (1, 2)), -- 1 = 1–15, 2 = 16–конец
  amount integer,                           -- сумма выплаты (для справки, опционально)
  paid_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, year, month, half)
);

ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

-- Только админ/суперадмин видят и управляют отметками.
DROP POLICY IF EXISTS "Admins manage partner payouts" ON public.partner_payouts;
CREATE POLICY "Admins manage partner payouts" ON public.partner_payouts
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE INDEX IF NOT EXISTS idx_partner_payouts_period ON public.partner_payouts (year, month, half);
