-- Кэш меню iiko: эндпоинт /api/2/menu/by_id жёстко лимитируется («Too many
-- requests»), а меню меняется редко. Кэшируем последний успешный список позиций
-- в интеграции и отдаём его при рейтлимите/повторных заходах в кабинет.
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS menu_cache jsonb;
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS menu_cached_at timestamptz;
