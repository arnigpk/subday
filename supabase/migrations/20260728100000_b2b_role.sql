-- B2B: роль администратора бизнес-аккаунта. Отдельной миграцией, т.к. Postgres
-- требует, чтобы новое значение enum было закоммичено до использования.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'b2b_admin';
