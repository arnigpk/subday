CREATE OR REPLACE FUNCTION public.create_preorder_with_deduction(
  _shop_id uuid,
  _shop_name text,
  _coffee_name text,
  _syrup text,
  _shop_address text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _coffee_remaining int;
  _preorder record;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock & check balance
  SELECT coffee_remaining INTO _coffee_remaining
  FROM public.user_stats
  WHERE user_id = _user_id
  FOR UPDATE;

  IF _coffee_remaining IS NULL OR _coffee_remaining < 1 THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_balance');
  END IF;

  -- Deduct
  UPDATE public.user_stats
  SET coffee_remaining = coffee_remaining - 1, updated_at = now()
  WHERE user_id = _user_id;

  -- Create preorder (триггер set_preorder_subscription_snapshot сам проставит подписку)
  INSERT INTO public.preorders (user_id, shop_id, shop_name, coffee_name, syrup, shop_address)
  VALUES (_user_id, _shop_id, _shop_name, _coffee_name, _syrup, _shop_address)
  RETURNING id, qr_code, created_at INTO _preorder;

  RETURN json_build_object(
    'success', true,
    'id', _preorder.id,
    'qr_code', _preorder.qr_code,
    'created_at', _preorder.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_preorder_with_deduction(uuid, text, text, text, text) TO authenticated;