-- ============================================================================
-- Богатые сообщения пользователю: заголовок, эмодзи/картинка, кнопка-действие,
-- дата окончания и стиль показа (плашка/модалка).
--
-- Все поля nullable / с дефолтами — существующие сообщения продолжают работать
-- как прежде: display_style='banner' => старый вид плашки, остальное пустое.
-- Новые сообщения из обновлённой админки создаются как 'modal'.
-- ============================================================================

ALTER TABLE public.app_messages
  ADD COLUMN IF NOT EXISTS title         text,
  ADD COLUMN IF NOT EXISTS media_type    text NOT NULL DEFAULT 'none',   -- none | emoji | image
  ADD COLUMN IF NOT EXISTS emoji         text,
  ADD COLUMN IF NOT EXISTS image_url     text,
  ADD COLUMN IF NOT EXISTS button_label  text,
  ADD COLUMN IF NOT EXISTS button_action text NOT NULL DEFAULT 'dismiss', -- dismiss | shop | packages | external
  ADD COLUMN IF NOT EXISTS button_value  text,                            -- shop_id или url
  ADD COLUMN IF NOT EXISTS ends_at       timestamptz,
  ADD COLUMN IF NOT EXISTS display_style text NOT NULL DEFAULT 'banner';  -- banner | modal

ALTER TABLE public.app_messages DROP CONSTRAINT IF EXISTS app_messages_media_type_chk;
ALTER TABLE public.app_messages ADD CONSTRAINT app_messages_media_type_chk
  CHECK (media_type IN ('none', 'emoji', 'image'));

ALTER TABLE public.app_messages DROP CONSTRAINT IF EXISTS app_messages_button_action_chk;
ALTER TABLE public.app_messages ADD CONSTRAINT app_messages_button_action_chk
  CHECK (button_action IN ('dismiss', 'shop', 'packages', 'external'));

ALTER TABLE public.app_messages DROP CONSTRAINT IF EXISTS app_messages_display_style_chk;
ALTER TABLE public.app_messages ADD CONSTRAINT app_messages_display_style_chk
  CHECK (display_style IN ('banner', 'modal'));

COMMENT ON COLUMN public.app_messages.display_style IS 'banner — плашка внизу (старый вид); modal — окно по центру';
COMMENT ON COLUMN public.app_messages.button_action IS 'dismiss — просто закрыть; shop — открыть кофейню (button_value=shop_id); packages — открыть тарифы; external — внешняя ссылка (button_value=url)';
