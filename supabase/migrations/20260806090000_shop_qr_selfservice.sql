-- ============================================================================
-- Второй способ забора: гость сканирует QR КОФЕЙНИ (а не бариста — QR гостя).
-- Старый способ полностью сохраняется и не меняется.
--
-- Безопасность: в QR кофейни зашит СЕКРЕТНЫЙ токен, а не shop_id. Иначе любой,
-- зная id кофейни (он публичный), нарисовал бы себе QR и списывал откуда угодно.
-- Токен привязан к точке (shop_id + address), потому что физически QR висит на
-- конкретной точке — это же даёт правильную маршрутизацию заказа в POS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shop_qr_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  address    text NOT NULL DEFAULT '',      -- '' = единственная/основная точка
  token      uuid NOT NULL DEFAULT gen_random_uuid(),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_qr_tokens_point ON public.shop_qr_tokens (shop_id, address);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_qr_tokens_token ON public.shop_qr_tokens (token);

ALTER TABLE public.shop_qr_tokens ENABLE ROW LEVEL SECURITY;

-- Читать токен может только персонал своей кофейни и админ (это секрет).
-- Гостю токен не нужен: он его сканирует с бумаги, а проверяет сервер.
DROP POLICY IF EXISTS "shop qr tokens read" ON public.shop_qr_tokens;
CREATE POLICY "shop qr tokens read" ON public.shop_qr_tokens FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR shop_id::text = ANY (ARRAY(SELECT public.get_staff_shop_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "shop qr tokens admin manage" ON public.shop_qr_tokens;
CREATE POLICY "shop qr tokens admin manage" ON public.shop_qr_tokens FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Способ списания — чтобы в истории было видно, кто сканировал: персонал или гость.
ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS scan_method text;
COMMENT ON COLUMN public.redemptions.scan_method IS 'staff — бариста сканировал QR гостя (по умолчанию); self — гость сканировал QR кофейни';

-- ---------------------------------------------------------------------------
-- Выдать/получить токен точки. Персонал своей кофейни или админ.
-- Токен создаётся лениво — при первом открытии экрана «QR кофейни».
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_shop_qr(p_shop_id uuid, p_address text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_addr  text := COALESCE(p_address, '');
  v_token uuid;
  v_name  text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND p_shop_id::text <> ALL (ARRAY(SELECT public.get_staff_shop_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Нет доступа к этой кофейне';
  END IF;

  SELECT name INTO v_name FROM public.shops WHERE id = p_shop_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Кофейня не найдена'; END IF;

  SELECT token INTO v_token FROM public.shop_qr_tokens
   WHERE shop_id = p_shop_id AND address = v_addr;

  IF v_token IS NULL THEN
    INSERT INTO public.shop_qr_tokens (shop_id, address)
    VALUES (p_shop_id, v_addr)
    ON CONFLICT (shop_id, address) DO UPDATE SET updated_at = now()
    RETURNING token INTO v_token;
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'shop_id', p_shop_id,
                            'address', v_addr, 'shop_name', v_name);
END $fn$;

REVOKE ALL ON FUNCTION public.get_or_create_shop_qr(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_shop_qr(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Перевыпуск токена (если QR скомпрометирован — например, фото утекло в сеть).
-- Старый QR сразу перестаёт работать.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotate_shop_qr(p_shop_id uuid, p_address text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_addr text := COALESCE(p_address, '');
  v_token uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND p_shop_id::text <> ALL (ARRAY(SELECT public.get_staff_shop_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Нет доступа к этой кофейне';
  END IF;

  UPDATE public.shop_qr_tokens
     SET token = gen_random_uuid(), updated_at = now()
   WHERE shop_id = p_shop_id AND address = v_addr
  RETURNING token INTO v_token;

  IF v_token IS NULL THEN
    INSERT INTO public.shop_qr_tokens (shop_id, address) VALUES (p_shop_id, v_addr)
    RETURNING token INTO v_token;
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END $fn$;

REVOKE ALL ON FUNCTION public.rotate_shop_qr(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_shop_qr(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Разбор токена при сканировании гостем. Вызывается ТОЛЬКО сервером
-- (edge-функция под service_role) — клиенту доступ не нужен и не даётся.
-- Возвращает точку и признак активной POS-интеграции: самообслуживание
-- разрешаем лишь там, где заказ реально упадёт на кассу.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_shop_qr(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_row   record;
  v_integ boolean;
BEGIN
  SELECT t.shop_id, t.address, t.is_active, s.name, s.is_active AS shop_active
    INTO v_row
    FROM public.shop_qr_tokens t
    JOIN public.shops s ON s.id = t.shop_id
   WHERE t.token = p_token;

  IF v_row.shop_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_qr');
  END IF;
  IF NOT v_row.is_active OR NOT v_row.shop_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'inactive');
  END IF;

  -- Активная интеграция для этой точки. Совпадение по адресу, либо интеграция
  -- дефолтная (address=''), либо сам QR общий на кофейню (address='') — тогда
  -- подходит любая активная интеграция этой кофейни.
  SELECT EXISTS (
    SELECT 1 FROM public.iiko_integrations i
     WHERE i.shop_id = v_row.shop_id AND i.is_active
       AND (i.address = v_row.address OR i.address = '' OR v_row.address = '')
    UNION ALL
    SELECT 1 FROM public.poster_integrations p
     WHERE p.shop_id = v_row.shop_id AND p.is_active
       AND (p.address = v_row.address OR p.address = '' OR v_row.address = '')
    UNION ALL
    SELECT 1 FROM public.rosta_integrations r
     WHERE r.shop_id = v_row.shop_id AND r.is_active
       AND (r.address = v_row.address OR r.address = '' OR v_row.address = '')
  ) INTO v_integ;

  RETURN jsonb_build_object(
    'ok', true, 'shop_id', v_row.shop_id, 'address', v_row.address,
    'shop_name', v_row.name, 'has_integration', v_integ
  );
END $fn$;

REVOKE ALL ON FUNCTION public.resolve_shop_qr(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_shop_qr(uuid) TO service_role;
