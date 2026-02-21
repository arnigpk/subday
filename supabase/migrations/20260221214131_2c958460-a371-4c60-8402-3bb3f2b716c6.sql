
-- Update activate_subscription to remove combo logic
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
  
  INSERT INTO user_subscriptions (user_id, subscription_type_id, started_at, expires_at, is_active)
  VALUES (_user_id, _subscription_type_id, now(), now() + (calculated_duration || ' days')::interval, true)
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
  
  RETURN json_build_object(
    'success', true, 'subscription_id', new_sub_id,
    'expires_at', now() + (calculated_duration || ' days')::interval,
    'cups_count', sub_type.cups_count, 'duration_days', calculated_duration,
    'subscription_name', sub_type.name
  );
END;
$function$;

-- Update expire_subscriptions to remove combo logic
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_sub RECORD;
BEGIN
  FOR expired_sub IN
    SELECT us.id, us.user_id, us.subscription_type_id, st.type
    FROM user_subscriptions us
    JOIN subscription_types st ON us.subscription_type_id = st.id
    WHERE us.is_active = true AND us.expires_at IS NOT NULL AND us.expires_at < now()
  LOOP
    UPDATE user_subscriptions SET is_active = false WHERE id = expired_sub.id;
    
    IF expired_sub.type = 'coffee' THEN
      UPDATE user_stats SET coffee_remaining = 0, coffee_total = 0, updated_at = now() WHERE user_id = expired_sub.user_id;
    ELSIF expired_sub.type = 'drinks' THEN
      UPDATE user_stats SET drinks_remaining = 0, drinks_total = 0, updated_at = now() WHERE user_id = expired_sub.user_id;
    END IF;
  END LOOP;
END;
$function$;

-- Remove any combo subscription types from database
UPDATE subscription_types SET is_active = false WHERE type = 'combo';
