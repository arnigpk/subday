-- Partner Dashboard/History считает выручку, сопоставляя записи redemptions/preorders
-- с тарифами по имени/id из subscription_types. Текущая RLS-политика прячет от
-- партнёров деактивированные тарифы (is_active = false), из-за чего после
-- переименования/отключения старого тарифа (например "Subday Max" -> "Subday Maxxx")
-- старые продажи по этому тарифу не находят цену/кол-во чашек и выпадают из статистики.
DROP POLICY IF EXISTS "Anyone can view active subscription types" ON public.subscription_types;

CREATE POLICY "Anyone can view active subscription types"
ON public.subscription_types FOR SELECT
USING (
  is_active = true
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'moderator')
  OR has_role(auth.uid(), 'partner')
  OR has_role(auth.uid(), 'barista')
);
