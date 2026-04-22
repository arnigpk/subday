
-- Лог гео-уведомлений: для дедупликации (12ч кулдаун на кофейню) и дневного лимита (макс 2/день).
CREATE TABLE public.geo_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  distance_meters integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_notif_user_shop_sent ON public.geo_notification_log (user_id, shop_id, sent_at DESC);
CREATE INDEX idx_geo_notif_user_sent ON public.geo_notification_log (user_id, sent_at DESC);

ALTER TABLE public.geo_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own geo notifications"
ON public.geo_notification_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage geo notifications"
ON public.geo_notification_log FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Тумблер геоуведомлений в профиле (по умолчанию ВКЛ).
ALTER TABLE public.profiles
ADD COLUMN geo_notifications_enabled boolean NOT NULL DEFAULT true;
