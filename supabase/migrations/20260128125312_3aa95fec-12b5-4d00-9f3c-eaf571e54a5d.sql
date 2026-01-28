-- Update activate_subscription function to use updated duration logic
-- 360+ cups = 1 year, 180+ cups = 6 months, otherwise 30 days (minimum)
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
  result json;
BEGIN
  -- Get subscription type details
  SELECT * INTO sub_type
  FROM subscription_types
  WHERE id = _subscription_type_id AND is_active = true;
  
  IF sub_type IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subscription type not found');
  END IF;
  
  -- Calculate duration based on cups count if duration_days not explicitly set or use stored value
  -- Priority: use stored duration_days from the subscription type
  calculated_duration := sub_type.duration_days;
  
  -- Deactivate any existing active subscriptions of the same type
  UPDATE user_subscriptions
  SET is_active = false
  WHERE user_id = _user_id 
    AND is_active = true
    AND subscription_type_id IN (
      SELECT id FROM subscription_types WHERE type = sub_type.type
    );
  
  -- Create new subscription
  INSERT INTO user_subscriptions (
    user_id,
    subscription_type_id,
    started_at,
    expires_at,
    is_active
  ) VALUES (
    _user_id,
    _subscription_type_id,
    now(),
    now() + (calculated_duration || ' days')::interval,
    true
  )
  RETURNING id INTO new_sub_id;
  
  -- Update user stats with new balance
  IF sub_type.type = 'coffee' THEN
    UPDATE user_stats
    SET 
      coffee_remaining = sub_type.cups_count,
      coffee_total = sub_type.cups_count,
      updated_at = now()
    WHERE user_id = _user_id;
    
    -- Create stats if not exists
    IF NOT FOUND THEN
      INSERT INTO user_stats (user_id, coffee_remaining, coffee_total)
      VALUES (_user_id, sub_type.cups_count, sub_type.cups_count);
    END IF;
  ELSIF sub_type.type = 'drinks' THEN
    UPDATE user_stats
    SET 
      drinks_remaining = sub_type.cups_count,
      drinks_total = sub_type.cups_count,
      updated_at = now()
    WHERE user_id = _user_id;
    
    IF NOT FOUND THEN
      INSERT INTO user_stats (user_id, drinks_remaining, drinks_total)
      VALUES (_user_id, sub_type.cups_count, sub_type.cups_count);
    END IF;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'subscription_id', new_sub_id,
    'expires_at', now() + (calculated_duration || ' days')::interval,
    'cups_count', sub_type.cups_count,
    'duration_days', calculated_duration
  );
END;
$function$;