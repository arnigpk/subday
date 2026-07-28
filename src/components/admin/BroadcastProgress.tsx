import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

interface Progress {
  broadcast_id: string;
  channel: string | null;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  processing: number;
  done: boolean;
}

interface Props {
  /** id запущенной рассылки; null — показать последнюю незавершённую этого типа */
  broadcastId: string | null;
  /** 'telegram' | 'push' — для подхвата последней рассылки после перезагрузки страницы */
  type: 'telegram' | 'push';
  onFinished?: () => void;
}

/**
 * Живой прогресс рассылки. Рассылка идёт в фоне (broadcast-worker дренит очередь
 * раз в минуту), поэтому статус тянем поллингом: часто, пока идёт отправка, и
 * прекращаем, как только очередь разобрана.
 */
export function BroadcastProgress({ broadcastId, type, onFinished }: Props) {
  const [id, setId] = useState<string | null>(broadcastId);
  const [p, setP] = useState<Progress | null>(null);
  const [finishedNotified, setFinishedNotified] = useState(false);

  useEffect(() => { if (broadcastId) { setId(broadcastId); setP(null); setFinishedNotified(false); } }, [broadcastId]);

  // Подхватываем незавершённую рассылку, если админ перезагрузил страницу.
  useEffect(() => {
    if (id) return;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_recent_broadcasts' as never, { p_type: type, p_limit: 3 } as never);
        const list = (data as unknown as Array<{ id: string; done: boolean; total: number }>) || [];
        const active = list.find(b => !b.done && b.total > 0);
        if (active) setId(active.id);
      } catch { /* не критично */ }
    })();
  }, [id, type]);

  const poll = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.rpc('get_broadcast_progress' as never, { p_broadcast_id: id } as never);
      if (error) return;
      setP(data as unknown as Progress);
    } catch { /* сеть моргнула — повторим на следующем тике */ }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    poll();
    const t = setInterval(poll, p?.done ? 10000 : 2000);
    return () => clearInterval(t);
  }, [id, poll, p?.done]);

  useEffect(() => {
    if (p?.done && !finishedNotified && (p.total ?? 0) > 0) {
      setFinishedNotified(true);
      onFinished?.();
    }
  }, [p?.done, p?.total, finishedNotified, onFinished]);

  if (!id || !p || p.total === 0) return null;

  const processed = p.sent + p.failed;
  const pct = p.total > 0 ? Math.round((processed / p.total) * 100) : 0;
  const inFlight = p.pending + p.processing;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {p.done
            ? <CheckCircle2 size={18} className="text-accent shrink-0" />
            : <Loader2 size={18} className="text-primary animate-spin shrink-0" />}
          <span className="font-semibold text-foreground truncate">
            {p.done ? 'Рассылка завершена' : 'Идёт отправка…'}
          </span>
        </div>
        <span className="text-sm font-bold text-foreground tabular-nums shrink-0">{pct}%</span>
      </div>

      <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${p.done ? 'bg-accent' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-secondary/50 p-2">
          <p className="text-lg font-bold text-foreground tabular-nums">{p.total}</p>
          <p className="text-[10px] text-muted-foreground">всего</p>
        </div>
        <div className="rounded-xl bg-accent/10 p-2">
          <p className="text-lg font-bold text-accent tabular-nums">{p.sent}</p>
          <p className="text-[10px] text-muted-foreground">отправлено</p>
        </div>
        <div className={`rounded-xl p-2 ${p.failed > 0 ? 'bg-destructive/10' : 'bg-secondary/50'}`}>
          <p className={`text-lg font-bold tabular-nums ${p.failed > 0 ? 'text-destructive' : 'text-foreground'}`}>{p.failed}</p>
          <p className="text-[10px] text-muted-foreground">не дошло</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-2">
          <p className="text-lg font-bold text-foreground tabular-nums">{inFlight}</p>
          <p className="text-[10px] text-muted-foreground">в очереди</p>
        </div>
      </div>

      {!p.done && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Send size={11} />
          Отправка идёт в фоне — можно закрыть страницу, прогресс не потеряется.
        </p>
      )}
      {p.done && p.failed > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <AlertTriangle size={11} className="text-destructive shrink-0" />
          {p.failed} не доставлено — обычно это заблокированный бот или отсутствующий токен устройства.
        </p>
      )}
    </div>
  );
}
