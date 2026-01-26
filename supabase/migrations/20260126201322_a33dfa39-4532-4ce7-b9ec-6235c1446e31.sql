-- 1. Таблица кофеен
CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT DEFAULT 'Атырау',
  working_hours TEXT DEFAULT '09:00-21:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Таблица типов подписок
CREATE TABLE public.subscription_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('coffee', 'drinks')),
  cups_count INTEGER NOT NULL,
  price INTEGER NOT NULL,
  duration_days INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Таблица подписок пользователей
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_type_id UUID REFERENCES public.subscription_types(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Добавить поле is_blocked в profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- 5. Enable RLS
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 6. RLS для shops - все могут читать активные, админы всё
CREATE POLICY "Anyone can view active shops"
ON public.shops FOR SELECT
USING (is_active = true OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins can manage shops"
ON public.shops FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 7. RLS для subscription_types - все могут читать активные
CREATE POLICY "Anyone can view active subscription types"
ON public.subscription_types FOR SELECT
USING (is_active = true OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage subscription types"
ON public.subscription_types FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 8. RLS для user_subscriptions
CREATE POLICY "Users can view own subscriptions"
ON public.user_subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins can manage subscriptions"
ON public.user_subscriptions FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 9. Триггеры для updated_at
CREATE TRIGGER update_shops_updated_at
BEFORE UPDATE ON public.shops
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_types_updated_at
BEFORE UPDATE ON public.subscription_types
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Добавить начальные данные кофеен
INSERT INTO public.shops (name, address, working_hours) VALUES
('Coffee Room', 'ул. Сатпаева 20', '08:00-22:00'),
('Espresso Bar', 'пр. Азаттык 15', '09:00-21:00'),
('The Brew', 'ул. Махамбета 5', '07:30-20:00');