-- Расширение рекламы (баннеры + SubFlow): вес/ротация, бюджеты показов и кликов,
-- дни недели и часы, таргет на тариф, частотный кап, A/B-креатив, дневной лимит баннеров.
--
-- ВАЖНО: все поля с безопасными дефолтами — существующая реклама работает БЕЗ ИЗМЕНЕНИЙ:
--   weight=1 (равный вес), *_budget/*_limit=0 (безлимит), days/hours NULL (всегда),
--   target_subscription_type_ids NULL (все), min_interval_minutes=0 (без кап),
--   ab_split=0 (A/B выключен), daily_limit=0 у баннеров (безлимит).

-- ── SubFlow-реклама ────────────────────────────────────────────────────────────
ALTER TABLE public.subflow_ads
  ADD COLUMN IF NOT EXISTS weight int NOT NULL DEFAULT 1,                       -- вес в ротации (больше = чаще)
  ADD COLUMN IF NOT EXISTS min_interval_minutes int NOT NULL DEFAULT 0,         -- не чаще 1 раза в N мин одному юзеру
  ADD COLUMN IF NOT EXISTS view_budget int NOT NULL DEFAULT 0,                  -- всего показов (0 = безлимит)
  ADD COLUMN IF NOT EXISTS click_limit int NOT NULL DEFAULT 0,                  -- всего кликов (0 = безлимит)
  ADD COLUMN IF NOT EXISTS days_of_week int[],                                  -- 1..7 (пн..вс), NULL = все дни
  ADD COLUMN IF NOT EXISTS hour_from int,                                       -- час начала (0..23), NULL = круглосуточно
  ADD COLUMN IF NOT EXISTS hour_to int,                                         -- час конца (1..24)
  ADD COLUMN IF NOT EXISTS target_subscription_type_ids uuid[],                 -- таргет на тарифы, NULL = все
  ADD COLUMN IF NOT EXISTS ab_split int NOT NULL DEFAULT 0,                     -- 0 = без A/B; 1..99 = % показов варианта B
  ADD COLUMN IF NOT EXISTS title_b text,
  ADD COLUMN IF NOT EXISTS content_b text,
  ADD COLUMN IF NOT EXISTS image_url_b text,
  ADD COLUMN IF NOT EXISTS views_total int NOT NULL DEFAULT 0,                  -- счётчик (триггер)
  ADD COLUMN IF NOT EXISTS clicks_total int NOT NULL DEFAULT 0;

-- ── Баннеры ────────────────────────────────────────────────────────────────────
ALTER TABLE public.ad_banners
  ADD COLUMN IF NOT EXISTS weight int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_limit int NOT NULL DEFAULT 0,                  -- показов в день на юзера (0 = безлимит)
  ADD COLUMN IF NOT EXISTS min_interval_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_budget int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_limit int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_of_week int[],
  ADD COLUMN IF NOT EXISTS hour_from int,
  ADD COLUMN IF NOT EXISTS hour_to int,
  ADD COLUMN IF NOT EXISTS target_subscription_type_ids uuid[],
  ADD COLUMN IF NOT EXISTS ab_split int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS caption_b text,
  ADD COLUMN IF NOT EXISTS image_url_b text,
  ADD COLUMN IF NOT EXISTS views_total int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_total int NOT NULL DEFAULT 0;

-- ── Счётчики показов/кликов: держим в самой записи (быстро для бюджета) ────────
CREATE OR REPLACE FUNCTION public.bump_subflow_ad_counters()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type = 'view' THEN
    UPDATE public.subflow_ads SET views_total = views_total + 1 WHERE id = NEW.ad_id;
  ELSIF NEW.event_type = 'click' THEN
    UPDATE public.subflow_ads SET clicks_total = clicks_total + 1 WHERE id = NEW.ad_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bump_subflow_ad_counters ON public.subflow_ad_events;
CREATE TRIGGER trg_bump_subflow_ad_counters
  AFTER INSERT ON public.subflow_ad_events
  FOR EACH ROW EXECUTE FUNCTION public.bump_subflow_ad_counters();

CREATE OR REPLACE FUNCTION public.bump_banner_counters()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type = 'view' THEN
    UPDATE public.ad_banners SET views_total = views_total + 1 WHERE id = NEW.banner_id;
  ELSIF NEW.event_type = 'click' THEN
    UPDATE public.ad_banners SET clicks_total = clicks_total + 1 WHERE id = NEW.banner_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bump_banner_counters ON public.ad_banner_events;
CREATE TRIGGER trg_bump_banner_counters
  AFTER INSERT ON public.ad_banner_events
  FOR EACH ROW EXECUTE FUNCTION public.bump_banner_counters();

-- Бэкфилл счётчиков из уже накопленных событий (чтобы бюджеты считались от реальных цифр).
UPDATE public.subflow_ads a SET
  views_total  = COALESCE((SELECT count(*) FROM public.subflow_ad_events e WHERE e.ad_id = a.id AND e.event_type = 'view'), 0),
  clicks_total = COALESCE((SELECT count(*) FROM public.subflow_ad_events e WHERE e.ad_id = a.id AND e.event_type = 'click'), 0);

UPDATE public.ad_banners b SET
  views_total  = COALESCE((SELECT count(*) FROM public.ad_banner_events e WHERE e.banner_id = b.id AND e.event_type = 'view'), 0),
  clicks_total = COALESCE((SELECT count(*) FROM public.ad_banner_events e WHERE e.banner_id = b.id AND e.event_type = 'click'), 0);

-- У событий баннеров не было user_id — без него нельзя считать дневной лимит и
-- частотный кап НА ПОЛЬЗОВАТЕЛЯ. Добавляем (nullable: старые события остаются как есть).
ALTER TABLE public.ad_banner_events ADD COLUMN IF NOT EXISTS user_id uuid;

-- Индексы для быстрых проверок лимитов по пользователю.
CREATE INDEX IF NOT EXISTS idx_subflow_ad_events_user_ad_time ON public.subflow_ad_events (user_id, ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_banner_events_user_banner_time ON public.ad_banner_events (user_id, banner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_banner_events_banner_time ON public.ad_banner_events (banner_id, created_at DESC);
