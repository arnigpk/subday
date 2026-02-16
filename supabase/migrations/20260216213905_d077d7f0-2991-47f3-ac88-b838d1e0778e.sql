
-- 1. Add public_id to profiles (short human-friendly ID)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id text UNIQUE;

-- Generate public_id for existing profiles (6-digit random)
UPDATE public.profiles 
SET public_id = LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0')
WHERE public_id IS NULL;

-- Make public_id NOT NULL with default
ALTER TABLE public.profiles ALTER COLUMN public_id SET DEFAULT LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
ALTER TABLE public.profiles ALTER COLUMN public_id SET NOT NULL;

-- 2. Add guest fields to user_stats
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS guest_coffees integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS guest_expires_at timestamp with time zone;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS guest_ever_received boolean NOT NULL DEFAULT false;

-- 3. Create guest_grants table
CREATE TABLE public.guest_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_user_id uuid NOT NULL,
  invitee_user_id uuid,
  invitee_phone text,
  month_key date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  CONSTRAINT guest_grants_status_check CHECK (status IN ('pending', 'active', 'expired', 'consumed'))
);

-- Uniqueness constraints
CREATE UNIQUE INDEX idx_guest_grants_inviter_month ON public.guest_grants (inviter_user_id, month_key);
CREATE UNIQUE INDEX idx_guest_grants_invitee ON public.guest_grants (invitee_user_id) WHERE invitee_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_guest_grants_invitee_phone ON public.guest_grants (invitee_phone) WHERE invitee_phone IS NOT NULL;

-- RLS
ALTER TABLE public.guest_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grants as inviter" ON public.guest_grants
  FOR SELECT USING (auth.uid() = inviter_user_id);

CREATE POLICY "Users can view own grants as invitee" ON public.guest_grants
  FOR SELECT USING (auth.uid() = invitee_user_id);

CREATE POLICY "Admins can manage guest_grants" ON public.guest_grants
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. DB function for atomic guest grant
CREATE OR REPLACE FUNCTION public.grant_guest_access(
  _inviter_id uuid,
  _invitee_id uuid,
  _month_key date,
  _expires_at timestamp with time zone
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
  -- Check inviter has coffee
  SELECT coffee_remaining INTO inviter_coffee FROM user_stats WHERE user_id = _inviter_id FOR UPDATE;
  IF inviter_coffee IS NULL OR inviter_coffee < 1 THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_coffee');
  END IF;

  -- Check invitee never received
  SELECT guest_ever_received INTO invitee_ever FROM user_stats WHERE user_id = _invitee_id FOR UPDATE;
  IF invitee_ever = true THEN
    RETURN json_build_object('success', false, 'error', 'already_received');
  END IF;

  -- Check existing grant for invitee
  SELECT id INTO existing_grant FROM guest_grants WHERE invitee_user_id = _invitee_id LIMIT 1;
  IF existing_grant IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_received');
  END IF;

  -- Check monthly limit
  SELECT id INTO existing_grant FROM guest_grants WHERE inviter_user_id = _inviter_id AND month_key = _month_key LIMIT 1;
  IF existing_grant IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'monthly_limit');
  END IF;

  -- Atomic grant
  INSERT INTO guest_grants (inviter_user_id, invitee_user_id, month_key, expires_at, status)
  VALUES (_inviter_id, _invitee_id, _month_key, _expires_at, 'active');

  UPDATE user_stats SET coffee_remaining = coffee_remaining - 1, updated_at = now() WHERE user_id = _inviter_id;
  UPDATE user_stats SET guest_coffees = guest_coffees + 1, guest_expires_at = _expires_at, guest_ever_received = true, updated_at = now() WHERE user_id = _invitee_id;

  -- Create stats for invitee if not exists
  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id, guest_coffees, guest_expires_at, guest_ever_received)
    VALUES (_invitee_id, 1, _expires_at, true);
  END IF;

  RETURN json_build_object('success', true, 'expires_at', _expires_at);
END;
$$;

-- 5. DB function for claiming pending grant
CREATE OR REPLACE FUNCTION public.claim_pending_guest_access(_invitee_id uuid, _invitee_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  grant_row RECORD;
  inviter_coffee int;
  invitee_ever bool;
  new_expires_at timestamp with time zone;
BEGIN
  -- Check if already received
  SELECT guest_ever_received INTO invitee_ever FROM user_stats WHERE user_id = _invitee_id;
  IF invitee_ever = true THEN
    RETURN json_build_object('success', false, 'reason', 'already_received');
  END IF;

  -- Find pending grant
  SELECT * INTO grant_row FROM guest_grants 
  WHERE invitee_phone = _invitee_phone AND status = 'pending' 
  ORDER BY created_at DESC LIMIT 1;

  IF grant_row IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'no_pending');
  END IF;

  -- Check inviter coffee
  SELECT coffee_remaining INTO inviter_coffee FROM user_stats WHERE user_id = grant_row.inviter_user_id FOR UPDATE;
  IF inviter_coffee IS NULL OR inviter_coffee < 1 THEN
    RETURN json_build_object('success', false, 'reason', 'inviter_insufficient');
  END IF;

  new_expires_at := now() + interval '10 days';

  -- Atomic claim
  UPDATE guest_grants SET invitee_user_id = _invitee_id, status = 'active', expires_at = new_expires_at WHERE id = grant_row.id;
  UPDATE user_stats SET coffee_remaining = coffee_remaining - 1, updated_at = now() WHERE user_id = grant_row.inviter_user_id;
  
  -- Update or create invitee stats
  UPDATE user_stats SET guest_coffees = guest_coffees + 1, guest_expires_at = new_expires_at, guest_ever_received = true, updated_at = now() WHERE user_id = _invitee_id;
  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id, guest_coffees, guest_expires_at, guest_ever_received)
    VALUES (_invitee_id, 1, new_expires_at, true);
  END IF;

  RETURN json_build_object('success', true, 'expires_at', new_expires_at);
END;
$$;
