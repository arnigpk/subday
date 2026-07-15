-- Пояснения к отдельным пунктам «Что входит» подписки (иконка «!» с всплывающим
-- текстом на клиенте). Объект: { "текст пункта": "пояснение" }. Не влияет на features.
ALTER TABLE public.subscription_types ADD COLUMN IF NOT EXISTS feature_hints jsonb;
