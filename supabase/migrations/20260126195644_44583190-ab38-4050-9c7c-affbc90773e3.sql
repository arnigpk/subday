-- 1. Enum для ролей
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'partner');

-- 2. Таблица ролей
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  shop_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. RLS для user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Функция проверки роли (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Функция получения shop_id партнёра
CREATE OR REPLACE FUNCTION public.get_partner_shop_id(_user_id UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT shop_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'partner'
  LIMIT 1
$$;

-- 6. Политика: только админы видят таблицу ролей
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Обновление политик для profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Обновление политик для user_stats
CREATE POLICY "Admins can view all stats"
ON public.user_stats FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can update any stats"
ON public.user_stats FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. Обновление политик для redemptions
CREATE POLICY "Admins can view all redemptions"
ON public.redemptions FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'moderator') OR
  (public.has_role(auth.uid(), 'partner') AND shop_id = public.get_partner_shop_id(auth.uid()))
);