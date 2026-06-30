-- Subscription freeze / unfreeze.
-- Model: freezing extends expires_at by the freeze duration (no paid time lost)
-- and blocks redemptions (enforced in partner-scan-qr). The time remaining at
-- freeze == expires_at - freeze_until, so an early unfreeze restores exactly
-- that remaining time from "now".

ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS frozen_at timestamptz;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS freeze_until timestamptz;
-- One freeze allowed per subscription. Reset automatically on the next
-- activation because activate_subscription INSERTs a fresh row (default false).
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS freeze_used boolean NOT NULL DEFAULT false;

-- Freeze all of the caller's active, non-frozen subscriptions for _days (7/10/14).
CREATE OR REPLACE FUNCTION public.freeze_subscription(_days integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  affected int;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF _days NOT IN (7, 10, 14) THEN
    RETURN json_build_object('success', false, 'error', 'invalid_days');
  END IF;
  IF EXISTS (SELECT 1 FROM user_subscriptions WHERE user_id = uid AND is_active = true AND is_frozen = true) THEN
    RETURN json_build_object('success', false, 'error', 'already_frozen');
  END IF;
  -- One freeze per subscription period.
  IF EXISTS (SELECT 1 FROM user_subscriptions WHERE user_id = uid AND is_active = true AND freeze_used = true) THEN
    RETURN json_build_object('success', false, 'error', 'freeze_already_used');
  END IF;

  UPDATE user_subscriptions
  SET is_frozen = true,
      freeze_used = true,
      frozen_at = now(),
      freeze_until = now() + make_interval(days => _days),
      expires_at = CASE WHEN expires_at IS NOT NULL
                        THEN expires_at + make_interval(days => _days)
                        ELSE expires_at END
  WHERE user_id = uid AND is_active = true AND COALESCE(is_frozen, false) = false;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RETURN json_build_object('success', false, 'error', 'no_active_subscription');
  END IF;

  RETURN json_build_object('success', true, 'days', _days, 'frozen_count', affected);
END;
$$;

-- Unfreeze immediately: expires_at = now + (expires_at - freeze_until).
CREATE OR REPLACE FUNCTION public.unfreeze_subscription()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  affected int;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE user_subscriptions
  SET expires_at = CASE
        WHEN expires_at IS NOT NULL AND freeze_until IS NOT NULL
        THEN now() + (expires_at - freeze_until)
        ELSE expires_at END,
      is_frozen = false,
      frozen_at = NULL,
      freeze_until = NULL
  WHERE user_id = uid AND is_active = true AND is_frozen = true;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RETURN json_build_object('success', false, 'error', 'not_frozen');
  END IF;

  RETURN json_build_object('success', true, 'unfrozen_count', affected);
END;
$$;

GRANT EXECUTE ON FUNCTION public.freeze_subscription(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfreeze_subscription() TO authenticated;
