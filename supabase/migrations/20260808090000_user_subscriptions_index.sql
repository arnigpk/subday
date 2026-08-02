-- Индекс на самый горячий запрос приложения: проверка активной подписки по
-- user_id при каждом запуске (useSubscriptionStatus, useDailyLimit,
-- useActiveSubscription, useAdEligibility). Раньше был только pkey → seq scan.
-- Полностью аддитивно и обратно совместимо: ускоряет те же запросы, что уже
-- шлют установленные на сторах приложения, ничего в поведении не меняя.
--
-- На проде индекс создан через CREATE INDEX CONCURRENTLY (без блокировки).
-- Здесь — обычный CREATE INDEX IF NOT EXISTS: на чистой БД таблица пустая и
-- операция мгновенна, а CONCURRENTLY нельзя запускать внутри транзакции миграции.
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_active
  ON public.user_subscriptions (user_id, is_active);
