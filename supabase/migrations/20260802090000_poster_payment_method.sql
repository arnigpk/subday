-- ============================================================================
-- Poster: закрытие чека на выбранный способ оплаты.
-- Incoming-orders API закрывает заказ только как «третья сторона» (pay_type=3,
-- payed_third_party) — способ оплаты там задать нельзя (проверено: closeTransaction
-- на транзакции incoming-order даёт err 88). Чтобы закрыть на КОНКРЕТНЫЙ способ,
-- используется transactions API (createTransaction → addTransactionProduct →
-- closeTransaction с payed_cash/payed_card/payed_cert/payment_method_id).
--   • суммы в transactions API — в МАЖОРНЫХ единицах (÷100 от копеек);
--   • нужны spot_tablet_id (касса) и user_id (сотрудник) — автоподставляются.
-- Это ОПЦИЯ: без выбранного способа оплаты Poster работает как раньше
-- (incoming-order, third_party) — существующие интеграции не затрагиваются.
-- ============================================================================

ALTER TABLE public.poster_integrations
  ADD COLUMN IF NOT EXISTS spot_tablet_id      text,   -- id кассы (access.getTablets)
  ADD COLUMN IF NOT EXISTS user_id             text,   -- id сотрудника (access.getEmployees)
  ADD COLUMN IF NOT EXISTS payment_method_id   text,   -- выбранный способ оплаты
  ADD COLUMN IF NOT EXISTS payment_method_name text,
  ADD COLUMN IF NOT EXISTS payment_method_kind text;   -- cash | card | cert | custom
