-- Поддержка авторизации iiko API v2 («приложение»: appId + apiKey + clientSecret).
-- Часть ключей не работает через /api/1/access_token и требует /api/v2/access_token.
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS client_secret text;
-- Теперь может быть либо api_login (v1), либо v2-набор — снимаем NOT NULL.
ALTER TABLE public.iiko_integrations ALTER COLUMN api_login DROP NOT NULL;
