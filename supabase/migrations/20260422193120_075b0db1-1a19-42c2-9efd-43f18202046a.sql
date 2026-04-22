-- Расширяем webhook_logs для структурированных логов edge-функций
-- Все новые колонки опциональные, исторические записи (paylink/freedompay) не затрагиваются.

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS function_name text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS message text;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_source_created
  ON public.webhook_logs (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_function_name_created
  ON public.webhook_logs (function_name, created_at DESC)
  WHERE function_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_user_id_created
  ON public.webhook_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;