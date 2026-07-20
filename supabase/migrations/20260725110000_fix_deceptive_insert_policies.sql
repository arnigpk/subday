-- ============================================================================
-- Политики, чьё название обещает ограничение, а условие пускает всех.
--
-- «Admins and service can insert push notifications» имела WITH CHECK (true):
-- любой пользователь мог вставить запись с пустым user_id, а политика чтения
-- показывает такие записи ВСЕМ — то есть можно было разослать фальшивое
-- уведомление от имени subday всем пользователям (заготовка для фишинга).
-- Следов злоупотребления нет: broadcast-записей с пустым user_id ноль.
--
-- Сервисная роль (edge-функции) RLS не подчиняется, поэтому рассылки
-- продолжают работать без изменений.
-- ============================================================================

DROP POLICY IF EXISTS "Admins and service can insert push notifications" ON public.push_notifications;
CREATE POLICY "Admins insert push notifications"
  ON public.push_notifications FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service can insert notifications" ON public.subflow_notifications;
CREATE POLICY "Admins insert subflow notifications"
  ON public.subflow_notifications FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins insert webhook logs"
  ON public.webhook_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
