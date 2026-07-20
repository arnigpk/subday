-- ============================================================================
-- Защита статистики рекламы от накрутки.
--
-- Политики «Anyone can insert» не проверяли ничего: любой авторизованный
-- пользователь мог вставлять показы и клики чужой рекламы. Это сжигало бы
-- бюджет партнёра, ломало атрибуцию и CTR — то есть ровно те цифры, по
-- которым рекламу собираются продавать. Плюс можно было проставить себе
-- показы, упереться в дневной лимит и не видеть рекламу вовсе.
--
-- Теперь событие можно записать только от своего имени и только по
-- существующему объявлению.
-- ============================================================================

-- SubFlow: user_id NOT NULL, поэтому требуем строгое совпадение с auth.uid().
DROP POLICY IF EXISTS "Anyone can insert ad events" ON public.subflow_ad_events;
CREATE POLICY "Users log own subflow ad events"
  ON public.subflow_ad_events FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND event_type IN ('view', 'click')
    AND EXISTS (SELECT 1 FROM public.subflow_ads a WHERE a.id = ad_id)
  );

-- Баннеры: user_id может быть NULL (баннеры видны и до входа), поэтому
-- разрешаем либо своё событие, либо анонимное — но чужим уже не притвориться.
DROP POLICY IF EXISTS "Anyone can insert banner events" ON public.ad_banner_events;
CREATE POLICY "Users log own banner events"
  ON public.ad_banner_events FOR INSERT
  WITH CHECK (
    (user_id IS NULL OR auth.uid() = user_id)
    AND event_type IN ('view', 'click')
    AND EXISTS (SELECT 1 FROM public.ad_banners b WHERE b.id = banner_id)
  );
