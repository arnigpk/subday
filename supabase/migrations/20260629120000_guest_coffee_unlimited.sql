-- Guest coffee: remove all grant limits, add quantity, change expiry to 14 days.
-- Decision: no limits at all (any user, any number of times); the chosen number
-- of cups is deducted from the inviter's own coffee balance.

-- 1. Drop the limit-enforcing UNIQUE indexes; recreate as plain (perf) indexes.
DROP INDEX IF EXISTS public.idx_guest_grants_inviter_month;
DROP INDEX IF EXISTS public.idx_guest_grants_invitee;
DROP INDEX IF EXISTS public.idx_guest_grants_invitee_phone;

CREATE INDEX IF NOT EXISTS idx_guest_grants_inviter
  ON public.guest_grants (inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_guest_grants_invitee
  ON public.guest_grants (invitee_user_id) WHERE invitee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_grants_invitee_phone
  ON public.guest_grants (invitee_phone) WHERE invitee_phone IS NOT NULL;

-- 2. Rewrite grant_guest_access:
--    - new _count param: deduct _count cups from inviter, add _count to invitee
--    - no once-per-recipient / monthly-limit checks (unlimited grants)
DROP FUNCTION IF EXISTS public.grant_guest_access(uuid, uuid, date, timestamp with time zone, uuid);

CREATE OR REPLACE FUNCTION public.grant_guest_access(
  _inviter_id uuid,
  _invitee_id uuid,
  _month_key date,
  _expires_at timestamp with time zone,
  _subscription_type_id uuid DEFAULT NULL,
  _count integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inviter_coffee int;
  grant_count int := GREATEST(1, COALESCE(_count, 1));
BEGIN
  -- Lock the inviter's stats row and verify they have enough cups.
  SELECT coffee_remaining INTO inviter_coffee FROM user_stats WHERE user_id = _inviter_id FOR UPDATE;
  IF inviter_coffee IS NULL OR inviter_coffee < grant_count THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_coffee');
  END IF;

  INSERT INTO guest_grants (inviter_user_id, invitee_user_id, month_key, expires_at, status, subscription_type_id)
  VALUES (_inviter_id, _invitee_id, _month_key, _expires_at, 'active', _subscription_type_id);

  -- Deduct the gifted cups from the inviter.
  UPDATE user_stats SET coffee_remaining = coffee_remaining - grant_count, updated_at = now()
    WHERE user_id = _inviter_id;

  -- Add the cups to the invitee (extend expiry to the new window).
  UPDATE user_stats SET
    guest_coffees = guest_coffees + grant_count,
    guest_expires_at = _expires_at,
    guest_ever_received = true,
    updated_at = now()
  WHERE user_id = _invitee_id;

  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id, guest_coffees, guest_expires_at, guest_ever_received)
    VALUES (_invitee_id, grant_count, _expires_at, true);
  END IF;

  RETURN json_build_object('success', true, 'expires_at', _expires_at, 'count', grant_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_guest_access(uuid, uuid, date, timestamp with time zone, uuid, integer)
  TO authenticated, anon, service_role;
