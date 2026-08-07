-- Убираем «общий» QR кофейни (address='') там, где у кофейни НЕСКОЛЬКО адресов.
--
-- Зачем: у общего кода resolve_shop_qr принимает ЛЮБУЮ активную интеграцию кофейни
-- (см. условие `v_row.address = ''`), поэтому у мультиадресной кофейни списание
-- могло уйти не на тот аккаунт кассы (у Coff адреса на разных iiko-аккаунтах).
--
-- Правило разбора пустого адреса (p_address = ''):
--   0 адресов у кофейни  → оставляем '' (это и есть единственная точка) — как раньше;
--   1 адрес              → подставляем этот адрес (чтобы не плодить дубль-точку '');
--   2+ адресов           → НЕ создаём общий код, возвращаем ok=false/address_required.
-- Точки с одним адресом ведут себя ровно как прежде — поведение не меняется.

CREATE OR REPLACE FUNCTION public.get_or_create_shop_qr(p_shop_id uuid, p_address text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_addr  text := COALESCE(p_address, '');
  v_token uuid;
  v_shop  record;
  v_addrs text[];
  v_cnt   int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND p_shop_id::text <> ALL (ARRAY(SELECT public.get_staff_shop_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Нет доступа к этой кофейне';
  END IF;

  SELECT name, addresses, address INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF v_shop.name IS NULL THEN RAISE EXCEPTION 'Кофейня не найдена'; END IF;

  -- Список адресов: массив addresses, иначе legacy-поле address, иначе пусто.
  v_addrs := CASE
    WHEN COALESCE(array_length(v_shop.addresses, 1), 0) > 0 THEN v_shop.addresses
    WHEN COALESCE(NULLIF(btrim(COALESCE(v_shop.address, '')), ''), '') <> '' THEN ARRAY[v_shop.address]
    ELSE ARRAY[]::text[]
  END;
  v_cnt := COALESCE(array_length(v_addrs, 1), 0);

  IF v_addr = '' THEN
    IF v_cnt = 1 THEN
      v_addr := v_addrs[1];                       -- одна точка → её адрес
    ELSIF v_cnt >= 2 THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'address_required',
        'message', 'У кофейни несколько адресов — выберите адрес точки для QR'
      );
    END IF;                                        -- v_cnt = 0 → остаётся ''
  END IF;

  SELECT token INTO v_token FROM public.shop_qr_tokens
   WHERE shop_id = p_shop_id AND address = v_addr;

  IF v_token IS NULL THEN
    INSERT INTO public.shop_qr_tokens (shop_id, address)
    VALUES (p_shop_id, v_addr)
    ON CONFLICT (shop_id, address) DO UPDATE SET updated_at = now()
    RETURNING token INTO v_token;
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'shop_id', p_shop_id,
                            'address', v_addr, 'shop_name', v_shop.name);
END $fn$;

REVOKE ALL ON FUNCTION public.get_or_create_shop_qr(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_shop_qr(uuid, text) TO authenticated;

-- Тот же разбор адреса при перевыпуске: rotate тоже умеет создавать строку.
CREATE OR REPLACE FUNCTION public.rotate_shop_qr(p_shop_id uuid, p_address text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_addr  text := COALESCE(p_address, '');
  v_token uuid;
  v_shop  record;
  v_addrs text[];
  v_cnt   int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND p_shop_id::text <> ALL (ARRAY(SELECT public.get_staff_shop_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Нет доступа к этой кофейне';
  END IF;

  SELECT name, addresses, address INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF v_shop.name IS NULL THEN RAISE EXCEPTION 'Кофейня не найдена'; END IF;

  v_addrs := CASE
    WHEN COALESCE(array_length(v_shop.addresses, 1), 0) > 0 THEN v_shop.addresses
    WHEN COALESCE(NULLIF(btrim(COALESCE(v_shop.address, '')), ''), '') <> '' THEN ARRAY[v_shop.address]
    ELSE ARRAY[]::text[]
  END;
  v_cnt := COALESCE(array_length(v_addrs, 1), 0);

  IF v_addr = '' THEN
    IF v_cnt = 1 THEN
      v_addr := v_addrs[1];
    ELSIF v_cnt >= 2 THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'address_required',
        'message', 'У кофейни несколько адресов — выберите адрес точки для QR'
      );
    END IF;
  END IF;

  UPDATE public.shop_qr_tokens
     SET token = gen_random_uuid(), updated_at = now()
   WHERE shop_id = p_shop_id AND address = v_addr
  RETURNING token INTO v_token;

  IF v_token IS NULL THEN
    INSERT INTO public.shop_qr_tokens (shop_id, address) VALUES (p_shop_id, v_addr)
    RETURNING token INTO v_token;
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'address', v_addr);
END $fn$;

REVOKE ALL ON FUNCTION public.rotate_shop_qr(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_shop_qr(uuid, text) TO authenticated;
