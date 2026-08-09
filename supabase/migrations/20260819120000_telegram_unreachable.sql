-- Недоступные Telegram-чаты.
--
-- В отличие от push, у Telegram нет способа заранее узнать, дойдёт ли сообщение:
-- человек мог заблокировать бота или так и не начать с ним диалог, и выясняется
-- это только в момент отправки. Из-за этого счётчик получателей показывал всю
-- базу привязанных аккаунтов, а доходило заметно меньше.
--
-- Поэтому запоминаем чаты, которые Telegram назвал недоступными НАВСЕГДА
-- (заблокирован, удалён, чат не найден). Временные отказы — лимит частоты,
-- сбой сервера — сюда не попадают: человек по-прежнему доступен.

CREATE TABLE IF NOT EXISTS public.telegram_unreachable (
  chat_id   text PRIMARY KEY,
  user_id   uuid,
  reason    text,
  marked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_unreachable ENABLE ROW LEVEL SECURITY;

-- Читают только админы и модераторы (нужно для превью аудитории).
-- Пишет отправщик рассылки под service_role, который RLS не касается.
DROP POLICY IF EXISTS "admins read telegram_unreachable" ON public.telegram_unreachable;
CREATE POLICY "admins read telegram_unreachable"
  ON public.telegram_unreachable FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX IF NOT EXISTS idx_telegram_unreachable_user ON public.telegram_unreachable (user_id);

-- Реальная Telegram-аудитория для превью рассылки: привязанные аккаунты минус
-- те, чьи чаты уже признаны недоступными. Возвращаем только user_id — сами
-- chat_id наружу не отдаём.
CREATE OR REPLACE FUNCTION public.get_telegram_reachable_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.user_id
  FROM public.profiles p
  WHERE p.phone LIKE '+telegram_%'
    AND NOT EXISTS (
      SELECT 1 FROM public.telegram_unreachable u
      WHERE u.chat_id = replace(p.phone, '+telegram_', '')
    )
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
$$;

REVOKE ALL ON FUNCTION public.get_telegram_reachable_user_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_telegram_reachable_user_ids() TO authenticated;
