-- При активации новой подписки:
--  1) Сбрасываем дневной лимит (daily_limit_reset_at = now) — чтобы после
--     переподключения тарифа пользователь мог сразу пить, не дожидаясь завтра.
--  2) Чистим дедуп уведомлений о низком балансе / скором окончании — чтобы при
--     следующем падении баланса уведомление пришло заново (а не молчало).
-- Копия текущей функции + эти два изменения (остальное без изменений).
CREATE OR REPLACE FUNCTION public.activate_subscription(_user_id uuid, _subscription_type_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sub_type RECORD;
  new_sub_id uuid;
  calculated_duration integer;
BEGIN
  SELECT * INTO sub_type
  FROM subscription_types
  WHERE id = _subscription_type_id AND is_active = true;

  IF sub_type IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subscription type not found');
  END IF;

  calculated_duration := sub_type.duration_days;

  -- Deactivate existing active subscriptions of the same type only
  UPDATE user_subscriptions SET is_active = false
  WHERE user_id = _user_id AND is_active = true
    AND subscription_type_id IN (
      SELECT id FROM subscription_types WHERE type = sub_type.type
    );

  -- НОВОЕ: daily_limit_reset_at = now() — дневной лимит стартует заново.
  INSERT INTO user_subscriptions (user_id, subscription_type_id, started_at, expires_at, is_active, daily_limit_reset_at)
  VALUES (_user_id, _subscription_type_id, now(), now() + (calculated_duration || ' days')::interval, true, now())
  RETURNING id INTO new_sub_id;

  IF sub_type.type = 'coffee' THEN
    UPDATE user_stats SET coffee_remaining = sub_type.cups_count, coffee_total = sub_type.cups_count, updated_at = now()
    WHERE user_id = _user_id;
    IF NOT FOUND THEN
      INSERT INTO user_stats (user_id, coffee_remaining, coffee_total) VALUES (_user_id, sub_type.cups_count, sub_type.cups_count);
    END IF;
  ELSIF sub_type.type = 'drinks' THEN
    UPDATE user_stats SET drinks_remaining = sub_type.cups_count, drinks_total = sub_type.cups_count, updated_at = now()
    WHERE user_id = _user_id;
    IF NOT FOUND THEN
      INSERT INTO user_stats (user_id, drinks_remaining, drinks_total) VALUES (_user_id, sub_type.cups_count, sub_type.cups_count);
    END IF;
  END IF;

  -- НОВОЕ: сбрасываем дедуп уведомлений (низкий баланс / скоро истекает) для этого юзера.
  DELETE FROM notification_dedupe_log
  WHERE user_id = _user_id
    AND (alert_key LIKE 'low_balance_%' OR alert_key LIKE 'expiring_soon_%');

  RETURN json_build_object(
    'success', true, 'subscription_id', new_sub_id,
    'expires_at', now() + (calculated_duration || ' days')::interval,
    'cups_count', sub_type.cups_count, 'duration_days', calculated_duration,
    'subscription_name', sub_type.name
  );
END;
$function$;
