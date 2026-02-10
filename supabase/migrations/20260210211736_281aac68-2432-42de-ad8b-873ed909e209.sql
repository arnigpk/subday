
-- Function to get dashboard stats (registrations and logins)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  today_date date := current_date;
  week_ago date := current_date - interval '7 days';
  today_registered bigint;
  today_logins bigint;
  week_registered bigint;
  week_logins bigint;
BEGIN
  -- Today registrations
  SELECT count(*) INTO today_registered
  FROM auth.users
  WHERE created_at::date = today_date;

  -- Today logins (users who signed in today)
  SELECT count(*) INTO today_logins
  FROM auth.users
  WHERE last_sign_in_at::date = today_date;

  -- Week registrations
  SELECT count(*) INTO week_registered
  FROM auth.users
  WHERE created_at::date >= week_ago;

  -- Week logins
  SELECT count(*) INTO week_logins
  FROM auth.users
  WHERE last_sign_in_at::date >= week_ago;

  RETURN json_build_object(
    'today_registered', today_registered,
    'today_logins', today_logins,
    'week_registered', week_registered,
    'week_logins', week_logins
  );
END;
$function$;
