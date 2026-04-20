-- Stage 2: Realtime channel authorization
-- Restricts realtime subscriptions so users cannot eavesdrop on other users' data

-- Enable RLS on realtime.messages (idempotent)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to start clean
DROP POLICY IF EXISTS "Authenticated users can receive own data broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Public realtime broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Owner-scoped realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Realtime access policy" ON realtime.messages;

-- Helper: extract table name and record from realtime payload
-- realtime.messages.extension stores 'postgres_changes', payload contains table & record
CREATE OR REPLACE FUNCTION public.realtime_can_access(_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _table text;
  _record jsonb;
  _old jsonb;
  _user_id uuid;
  _row_user uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RETURN false; END IF;

  -- Admins see everything
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;

  _table := _payload->'data'->>'table';
  _record := COALESCE(_payload->'data'->'record', '{}'::jsonb);
  _old := COALESCE(_payload->'data'->'old_record', '{}'::jsonb);

  -- Public streams: allow all authenticated users
  IF _table IN (
    'subflow_posts','subflow_comments','subflow_reactions',
    'subflow_ads','subflow_ad_comments','subflow_ad_reactions','subflow_ad_events',
    'stories','story_likes','story_views',
    'ad_banners','ad_banner_events','app_messages',
    'shops','subscription_types','special_offers','subflow_follows'
  ) THEN
    RETURN true;
  END IF;

  -- Owner-scoped streams: check user_id field
  IF _table IN (
    'preorders','push_notifications','subflow_notifications',
    'user_stats','user_subscriptions','redemptions',
    'payment_orders','subscription_transactions','device_tokens',
    'app_message_dismissals','app_message_views','app_message_unique_views',
    'user_offer_redemptions','barista_shifts'
  ) THEN
    _row_user := COALESCE(
      NULLIF(_record->>'user_id','')::uuid,
      NULLIF(_old->>'user_id','')::uuid
    );
    -- push_notifications: user_id NULL means broadcast to all
    IF _table = 'push_notifications' AND _row_user IS NULL THEN
      RETURN true;
    END IF;
    RETURN _row_user = _user_id;
  END IF;

  -- guest_grants: visible to inviter or invitee
  IF _table = 'guest_grants' THEN
    RETURN COALESCE(NULLIF(_record->>'inviter_user_id','')::uuid, NULLIF(_old->>'inviter_user_id','')::uuid) = _user_id
        OR COALESCE(NULLIF(_record->>'invitee_user_id','')::uuid, NULLIF(_old->>'invitee_user_id','')::uuid) = _user_id;
  END IF;

  -- Default: deny unknown tables
  RETURN false;
END;
$$;

-- Apply policy to realtime.messages
CREATE POLICY "Authorized realtime access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.realtime_can_access(payload));