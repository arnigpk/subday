-- 1. Drop unused investor_settings table (no code references)
DROP TABLE IF EXISTS public.investor_settings CASCADE;

-- 2. Drop legacy 4-arg grant_guest_access (kept only the 5-arg version)
DROP FUNCTION IF EXISTS public.grant_guest_access(uuid, uuid, date, timestamp with time zone);