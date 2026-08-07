-- Одноразовый QR пользователя (тот, что показывают бариста).
--
-- Срока по ВРЕМЕНИ нет (как и просили) — ограничение по ИСПОЛЬЗОВАНИЮ: код живёт,
-- пока его не списали. После успешного списания nonce меняется, и старый код
-- (в т.ч. скриншот) больше не сработает.
--
-- QR кофейни (shop_qr_tokens) НЕ трогаем — он многоразовый по определению.
-- Предзаказ уже одноразовый (preorders.qr_scanned).
--
-- Совместимость: у старых установленных приложений в QR нет nonce, а старые
-- приложения бариста не передают его на сервер. Поэтому вводим флаг строгости
-- qr_settings.qr_nonce_enforce:
--   false (по умолчанию) — nonce проверяем и гасим, ЕСЛИ он пришёл; иначе пускаем
--                          как раньше. Ничего не ломается при раскатке.
--   true                 — для пользователей, у которых nonce уже выпущен,
--                          скан без nonce отклоняется (полная одноразовость).
-- Флаг переключается из БД без редеплоя, когда сборки разойдутся по устройствам.

CREATE TABLE IF NOT EXISTS public.user_qr_nonces (
  user_id      uuid PRIMARY KEY,
  nonce        uuid NOT NULL DEFAULT gen_random_uuid(),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  used_count   int NOT NULL DEFAULT 0,
  last_used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_qr_nonces_nonce ON public.user_qr_nonces (nonce);

ALTER TABLE public.user_qr_nonces ENABLE ROW LEVEL SECURITY;

-- Клиент читает ТОЛЬКО свой nonce (нужен, чтобы собрать QR). Писать нельзя —
-- выпуск и гашение идут через SECURITY DEFINER функции ниже.
DROP POLICY IF EXISTS "user reads own qr nonce" ON public.user_qr_nonces;
CREATE POLICY "user reads own qr nonce" ON public.user_qr_nonces
  FOR SELECT USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Выдать текущий nonce пользователя (создать при первом обращении).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_qr_nonce()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_nonce uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  INSERT INTO public.user_qr_nonces (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT nonce INTO v_nonce FROM public.user_qr_nonces WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true, 'nonce', v_nonce);
END $fn$;

REVOKE ALL ON FUNCTION public.get_user_qr_nonce() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_qr_nonce() TO authenticated;

-- ---------------------------------------------------------------------------
-- Погасить nonce при списании. Атомарно: один UPDATE с проверкой текущего
-- значения — параллельные сканы одного кода не пройдут дважды (row lock).
-- Вызывается ТОЛЬКО сервером (edge под service_role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_user_qr_nonce(p_user_id uuid, p_nonce uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_new uuid;
  v_has boolean;
BEGIN
  UPDATE public.user_qr_nonces
     SET nonce = gen_random_uuid(),
         issued_at = now(),
         used_count = used_count + 1,
         last_used_at = now()
   WHERE user_id = p_user_id AND nonce = p_nonce
  RETURNING nonce INTO v_new;

  IF v_new IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'next_nonce', v_new);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_qr_nonces WHERE user_id = p_user_id) INTO v_has;
  -- Кода нет вовсе → пользователь ещё ни разу не выпускал nonce (старое приложение).
  RETURN jsonb_build_object('ok', false, 'error', CASE WHEN v_has THEN 'used_or_invalid' ELSE 'no_nonce' END);
END $fn$;

REVOKE ALL ON FUNCTION public.consume_user_qr_nonce(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_user_qr_nonce(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Есть ли у пользователя выпущенный nonce (для строгого режима на сервере).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_qr_nonce(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_qr_nonces WHERE user_id = p_user_id);
$$;

REVOKE ALL ON FUNCTION public.user_has_qr_nonce(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_qr_nonce(uuid) TO service_role;

-- Флаг строгости (по умолчанию мягкий режим на время раскатки сборок).
INSERT INTO public.qr_settings (setting_key, setting_value)
VALUES ('qr_nonce_enforce', 'false')
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Перевыпуск QR КОФЕЙНИ — только владелец (partner) или админ. Бариста/кассир
-- перевыпускать не может: физический код на стойке меняет владелец точки.
-- Разбор пустого адреса — как в предыдущей миграции (одноадресные не затронуты).
-- ---------------------------------------------------------------------------
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
  -- ТОЛЬКО партнёр этой кофейни или админ (бариста — нет).
  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'partner'
          AND ur.shop_id::uuid = p_shop_id
     ) THEN
    RAISE EXCEPTION 'Перевыпустить QR может только владелец кофейни';
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
