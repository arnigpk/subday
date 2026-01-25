-- Включаем RLS для otp_codes (доступ только через service role)
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Политика: никто не может напрямую читать/писать OTP коды (только service role)
-- Service role обходит RLS автоматически

-- Удаляем старую permissive политику для profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

-- Создаём более безопасную политику для вставки (пользователи могут создать свой профиль)
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);