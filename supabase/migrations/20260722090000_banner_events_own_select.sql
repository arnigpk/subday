-- Дневной лимит и частотный кап для баннеров считаются на клиенте по событиям показа.
-- Без права читать свои события клиент всегда видел 0 показов, поэтому лимиты не срабатывали.
CREATE POLICY "Users can view own banner events"
  ON public.ad_banner_events
  FOR SELECT
  USING (auth.uid() = user_id);
