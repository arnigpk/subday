-- Слайды приветственного онбординга — редактируются в админке.
-- Клиент читает активные слайды; при пустоте/ошибке приложение показывает
-- вшитые дефолтные слайды (онбординг никогда не ломается из-за БД).

CREATE TABLE IF NOT EXISTS public.onboarding_slides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order   integer NOT NULL DEFAULT 0,
  emoji        text NOT NULL DEFAULT '☕',
  title        text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',            -- абзацы через \n; строки «- » = список
  button_label text NOT NULL DEFAULT 'Далее →',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_slides_order ON public.onboarding_slides (sort_order);

ALTER TABLE public.onboarding_slides ENABLE ROW LEVEL SECURITY;

-- Читать активные слайды может кто угодно (контент маркетинговый, не секрет).
DROP POLICY IF EXISTS "Anyone reads active onboarding slides" ON public.onboarding_slides;
CREATE POLICY "Anyone reads active onboarding slides" ON public.onboarding_slides
  FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'admin'::app_role));

-- Управлять — только админ.
DROP POLICY IF EXISTS "Admins manage onboarding slides" ON public.onboarding_slides;
CREATE POLICY "Admins manage onboarding slides" ON public.onboarding_slides
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Сид: текущие 3 дефолтных слайда (только если таблица пуста).
INSERT INTO public.onboarding_slides (sort_order, emoji, title, body, button_label)
SELECT * FROM (VALUES
  (1, '☕', 'Одна подписка — десятки, сотни кофеен',
   E'subday объединяет кофейни города в одной подписке.\nВыберите тариф, платите 1 раз в месяц и получайте напитки в кофейнях-партнёрах без лишних оплат за каждый кофе.\nУже более 20 кофеен в одной подписке.',
   'Далее →'),
  (2, '💳', 'Как оформить подписку?',
   E'Перейдите в раздел «Подписки», выберите подходящий тариф и нажмите «Оформить».\nОплата доступна через:\n- Kaspi\n- Банковскую карту\n- Apple Pay\n- Google Pay\nПосле оплаты подписка активируется автоматически.',
   'Далее →'),
  (3, '📱', 'Как пользоваться?',
   E'- Откройте приложение.\n- Выберите кофейню из списка партнёров.\n- Покажите QR-код сотруднику кофейни.\n- Получите свой напиток.\nВсё занимает меньше минуты.',
   'Начать пользоваться')
) AS v(sort_order, emoji, title, body, button_label)
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_slides);
