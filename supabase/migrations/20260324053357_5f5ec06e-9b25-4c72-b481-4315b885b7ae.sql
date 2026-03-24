-- Add subscription_type_id to guest_grants to track which subscription the guest inherits
ALTER TABLE public.guest_grants ADD COLUMN subscription_type_id uuid REFERENCES public.subscription_types(id);

-- Update grant_guest_access function to accept and store subscription_type_id
CREATE OR REPLACE FUNCTION public.grant_guest_access(
  _inviter_id uuid, 
  _invitee_id uuid, 
  _month_key date, 
  _expires_at timestamp with time zone,
  _subscription_type_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inviter_coffee int;
  invitee_ever bool;
  existing_grant uuid;
BEGIN
  SELECT coffee_remaining INTO inviter_coffee FROM user_stats WHERE user_id = _inviter_id FOR UPDATE;
  IF inviter_coffee IS NULL OR inviter_coffee < 1 THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_coffee');
  END IF;

  SELECT guest_ever_received INTO invitee_ever FROM user_stats WHERE user_id = _invitee_id FOR UPDATE;
  IF invitee_ever = true THEN
    RETURN json_build_object('success', false, 'error', 'already_received');
  END IF;

  SELECT id INTO existing_grant FROM guest_grants WHERE invitee_user_id = _invitee_id LIMIT 1;
  IF existing_grant IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_received');
  END IF;

  SELECT id INTO existing_grant FROM guest_grants WHERE inviter_user_id = _inviter_id AND month_key = _month_key LIMIT 1;
  IF existing_grant IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'monthly_limit');
  END IF;

  INSERT INTO guest_grants (inviter_user_id, invitee_user_id, month_key, expires_at, status, subscription_type_id)
  VALUES (_inviter_id, _invitee_id, _month_key, _expires_at, 'active', _subscription_type_id);

  UPDATE user_stats SET coffee_remaining = coffee_remaining - 1, updated_at = now() WHERE user_id = _inviter_id;
  UPDATE user_stats SET guest_coffees = guest_coffees + 1, guest_expires_at = _expires_at, guest_ever_received = true, updated_at = now() WHERE user_id = _invitee_id;

  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id, guest_coffees, guest_expires_at, guest_ever_received)
    VALUES (_invitee_id, 1, _expires_at, true);
  END IF;

  RETURN json_build_object('success', true, 'expires_at', _expires_at);
END;
$$;