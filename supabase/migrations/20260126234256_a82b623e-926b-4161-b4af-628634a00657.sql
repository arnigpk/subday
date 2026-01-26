-- Create a function to expire subscriptions and reset balances
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_sub RECORD;
BEGIN
  -- Find all expired but still active subscriptions
  FOR expired_sub IN
    SELECT us.id, us.user_id, us.subscription_type_id, st.type
    FROM user_subscriptions us
    JOIN subscription_types st ON us.subscription_type_id = st.id
    WHERE us.is_active = true 
      AND us.expires_at IS NOT NULL 
      AND us.expires_at < now()
  LOOP
    -- Mark subscription as inactive
    UPDATE user_subscriptions
    SET is_active = false
    WHERE id = expired_sub.id;
    
    -- Reset the corresponding balance based on subscription type
    IF expired_sub.type = 'coffee' THEN
      UPDATE user_stats
      SET coffee_remaining = 0, coffee_total = 0, updated_at = now()
      WHERE user_id = expired_sub.user_id;
    ELSIF expired_sub.type = 'drinks' THEN
      UPDATE user_stats
      SET drinks_remaining = 0, drinks_total = 0, updated_at = now()
      WHERE user_id = expired_sub.user_id;
    END IF;
  END LOOP;
END;
$$;

-- Create a function to activate a subscription for a user
CREATE OR REPLACE FUNCTION public.activate_subscription(
  _user_id uuid,
  _subscription_type_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_type RECORD;
  new_sub_id uuid;
  result json;
BEGIN
  -- Get subscription type details
  SELECT * INTO sub_type
  FROM subscription_types
  WHERE id = _subscription_type_id AND is_active = true;
  
  IF sub_type IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subscription type not found');
  END IF;
  
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
    now() + (sub_type.duration_days || ' days')::interval,
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
    'expires_at', now() + (sub_type.duration_days || ' days')::interval,
    'cups_count', sub_type.cups_count
  );
END;
$$;