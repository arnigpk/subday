-- Фоновая очередь рассылок (Telegram/PUSH). Админ ставит рассылку в очередь
-- (быстрый bulk-insert) и получает ответ мгновенно; воркер (broadcast-worker,
-- вызывается pg_cron каждую минуту + сразу после постановки) шлёт батчами,
-- никогда не упираясь в лимит времени edge-воркера.

-- Статус рассылки в шапке: 'queued' | 'sending' | 'done'. Старые строки — 'done'.
ALTER TABLE public.broadcast_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';

-- Очередь получателей: по одному целевому адресату (telegram_id или fcm-токен).
CREATE TABLE IF NOT EXISTS public.broadcast_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  broadcast_id uuid REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  channel text NOT NULL,                     -- 'telegram' | 'push'
  target text NOT NULL,                      -- telegram_id или fcm-токен
  user_id uuid,
  status text NOT NULL DEFAULT 'pending',    -- pending | processing | sent | failed
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_broadcast_queue_pending
  ON public.broadcast_queue (channel, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_broadcast
  ON public.broadcast_queue (broadcast_id);

-- Пишет/читает только сервер (service role обходит RLS). Клиенту не нужно.
ALTER TABLE public.broadcast_queue ENABLE ROW LEVEL SECURITY;

-- Атомарный захват батча (FOR UPDATE SKIP LOCKED) — безопасно при параллельных воркерах.
CREATE OR REPLACE FUNCTION public.claim_broadcast_batch(_channel text, _limit int)
RETURNS SETOF public.broadcast_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.broadcast_queue q
  SET status = 'processing'
  WHERE q.id IN (
    SELECT id FROM public.broadcast_queue
    WHERE status = 'pending' AND channel = _channel
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING q.*;
END;
$$;

-- Пересчёт прогресса рассылки из очереди (race-free) + финализация статуса.
CREATE OR REPLACE FUNCTION public.sync_broadcast_progress(_broadcast_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE _sent int; _failed int; _pending int;
BEGIN
  SELECT count(*) FILTER (WHERE status = 'sent'),
         count(*) FILTER (WHERE status = 'failed'),
         count(*) FILTER (WHERE status IN ('pending', 'processing'))
    INTO _sent, _failed, _pending
  FROM public.broadcast_queue WHERE broadcast_id = _broadcast_id;

  UPDATE public.broadcast_messages
    SET sent_count = _sent,
        failed_count = _failed,
        status = CASE WHEN _pending = 0 THEN 'done' ELSE 'sending' END
    WHERE id = _broadcast_id;
END;
$$;
