-- 1. Add snapshot columns to preorders
ALTER TABLE public.preorders
ADD COLUMN IF NOT EXISTS subscription_type_id uuid,
ADD COLUMN IF NOT EXISTS subscription_name text,
ADD COLUMN IF NOT EXISTS subscription_price numeric,
ADD COLUMN IF NOT EXISTS subscription_cups integer,
ADD COLUMN IF NOT EXISTS max_volume text;

-- 2. Trigger function to capture subscription snapshot on insert
CREATE OR REPLACE FUNCTION public.set_preorder_subscription_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sub_record RECORD;
BEGIN
  -- Only set if not provided
  IF NEW.subscription_type_id IS NOT NULL AND NEW.subscription_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find user's active coffee subscription (most recent)
  SELECT st.id, st.name, st.price, st.cups_count, st.max_volume
    INTO sub_record
  FROM public.user_subscriptions us
  JOIN public.subscription_types st ON st.id = us.subscription_type_id
  WHERE us.user_id = NEW.user_id
    AND us.is_active = true
    AND st.type = 'coffee'
  ORDER BY us.created_at DESC
  LIMIT 1;

  -- Fallback: most recent subscription of any state
  IF sub_record IS NULL THEN
    SELECT st.id, st.name, st.price, st.cups_count, st.max_volume
      INTO sub_record
    FROM public.user_subscriptions us
    JOIN public.subscription_types st ON st.id = us.subscription_type_id
    WHERE us.user_id = NEW.user_id
      AND st.type = 'coffee'
    ORDER BY us.created_at DESC
    LIMIT 1;
  END IF;

  IF sub_record IS NOT NULL THEN
    NEW.subscription_type_id := COALESCE(NEW.subscription_type_id, sub_record.id);
    NEW.subscription_name := COALESCE(NEW.subscription_name, sub_record.name);
    NEW.subscription_price := COALESCE(NEW.subscription_price, sub_record.price);
    NEW.subscription_cups := COALESCE(NEW.subscription_cups, sub_record.cups_count);
    NEW.max_volume := COALESCE(NEW.max_volume, sub_record.max_volume);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_preorder_subscription_snapshot ON public.preorders;
CREATE TRIGGER trg_set_preorder_subscription_snapshot
BEFORE INSERT ON public.preorders
FOR EACH ROW
EXECUTE FUNCTION public.set_preorder_subscription_snapshot();

-- 3. Backfill existing preorders with most-recent coffee subscription per user
UPDATE public.preorders p
SET
  subscription_type_id = sub.id,
  subscription_name = sub.name,
  subscription_price = sub.price,
  subscription_cups = sub.cups_count,
  max_volume = sub.max_volume
FROM (
  SELECT DISTINCT ON (us.user_id)
    us.user_id,
    st.id, st.name, st.price, st.cups_count, st.max_volume
  FROM public.user_subscriptions us
  JOIN public.subscription_types st ON st.id = us.subscription_type_id
  WHERE st.type = 'coffee'
  ORDER BY us.user_id, us.created_at DESC
) sub
WHERE p.user_id = sub.user_id
  AND p.subscription_name IS NULL;