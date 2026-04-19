-- Лёгкая таблица для дедупликации авто-уведомлений (low_balance, expiring_soon),
-- независимая от push_notifications, чтобы тумблер in_app_enabled не ломал дедупликацию.
CREATE TABLE IF NOT EXISTS public.notification_dedupe_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  alert_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_dedupe_user_key_time
  ON public.notification_dedupe_log (user_id, alert_key, created_at DESC);

ALTER TABLE public.notification_dedupe_log ENABLE ROW LEVEL SECURITY;

-- Только сервисные функции (через service_role) и админы могут читать/писать
CREATE POLICY "Admins can view dedupe log"
ON public.notification_dedupe_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete dedupe log"
ON public.notification_dedupe_log
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
-- Inserts происходят только из edge функций под service_role (RLS обходит)
