-- Своё логирование клиентских ошибок (вместо внешнего Sentry): ошибки рендера,
-- пойманные ErrorBoundary, и необработанные исключения/промисы шлются в эту
-- таблицу через edge-функцию log-client-error (service role). Данные не покидают
-- вашу инфраструктуру. Просмотр — в админке.
--
-- Полностью аддитивно: установленные на сторах приложения этот код не вызывают,
-- их поведение не меняется.

CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  section         text,                 -- 'app' | 'subflow-feed' | 'global' | 'promise'
  message         text,                 -- error.message (обрезано)
  stack           text,                 -- стек (обрезан)
  component_stack text,                 -- React component stack (обрезан)
  url             text,                 -- где случилось
  user_agent      text,
  app_version     text,                 -- версия сборки
  platform        text,                 -- web | ios | android
  user_id         uuid                  -- если известен (без FK: лог не должен падать)
);

-- Индекс для админского просмотра «свежие сверху».
CREATE INDEX IF NOT EXISTS idx_client_error_logs_created ON public.client_error_logs (created_at DESC);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- Читать могут только админы/модераторы. Вставка идёт через edge-функцию под
-- service role (RLS её не ограничивает), прямой клиентский insert запрещён.
DROP POLICY IF EXISTS "Admins read client error logs" ON public.client_error_logs;
CREATE POLICY "Admins read client error logs" ON public.client_error_logs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- Админ может чистить старые логи.
DROP POLICY IF EXISTS "Admins delete client error logs" ON public.client_error_logs;
CREATE POLICY "Admins delete client error logs" ON public.client_error_logs
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE INSERT, UPDATE ON public.client_error_logs FROM anon, authenticated;
