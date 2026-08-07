-- История статусов POS-интеграций (в первую очередь — связь кассы с облаком).
--
-- Зачем: когда касса отваливается, симптом всплывает позже (заказ не дошёл), и
-- ответить «когда именно отвалилась» было нечем — статус проверялся только пока
-- открыта страница кабинета и нигде не сохранялся. Теперь крон раз в 10 минут
-- пишет состояние, и по журналу видно точный момент перехода.
--
-- Пишем ТОЛЬКО при смене состояния (+ обновляем last_checked_at у текущей строки),
-- поэтому таблица остаётся крошечной и читается как таймлайн.

CREATE TABLE IF NOT EXISTS public.integration_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  address         text NOT NULL DEFAULT '',
  provider        text NOT NULL,                 -- iiko | poster | rosta
  status          text NOT NULL,                 -- online | offline | unknown | error
  detail          text,
  changed_at      timestamptz NOT NULL DEFAULT now(),  -- когда состояние стало таким
  last_checked_at timestamptz NOT NULL DEFAULT now()   -- когда подтверждали в последний раз
);

CREATE INDEX IF NOT EXISTS idx_integration_status_log_key
  ON public.integration_status_log (shop_id, address, provider, changed_at DESC);

ALTER TABLE public.integration_status_log ENABLE ROW LEVEL SECURITY;

-- Партнёр видит журнал своих кофеен, админ — все. Пишет только сервер (service_role).
DROP POLICY IF EXISTS "staff reads own integration status log" ON public.integration_status_log;
CREATE POLICY "staff reads own integration status log" ON public.integration_status_log
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR shop_id::text = ANY (ARRAY(SELECT public.get_staff_shop_ids(auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- Записать состояние: новая строка ТОЛЬКО если статус изменился, иначе просто
-- продлеваем last_checked_at. Возвращает true, если состояние сменилось.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_integration_status(
  _shop_id uuid, _address text, _provider text, _status text, _detail text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_last record;
BEGIN
  SELECT id, status INTO v_last
    FROM public.integration_status_log
   WHERE shop_id = _shop_id AND address = COALESCE(_address,'') AND provider = _provider
   ORDER BY changed_at DESC LIMIT 1;

  IF v_last.id IS NOT NULL AND v_last.status = _status THEN
    UPDATE public.integration_status_log
       SET last_checked_at = now(), detail = _detail
     WHERE id = v_last.id;
    RETURN false;
  END IF;

  INSERT INTO public.integration_status_log (shop_id, address, provider, status, detail)
  VALUES (_shop_id, COALESCE(_address,''), _provider, _status, _detail);
  RETURN true;
END $fn$;

REVOKE ALL ON FUNCTION public.record_integration_status(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_integration_status(uuid, text, text, text, text) TO service_role;
