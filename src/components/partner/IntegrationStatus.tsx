import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle, Activity } from 'lucide-react';

type St = 'ok' | 'warn' | 'error' | 'off';
interface StatusItem { key: string; label: string; status: St; detail: string }

const REFRESH_MS = 5 * 60 * 1000; // авто-обновление каждые 5 минут

const dot: Record<St, string> = { ok: 'text-accent', warn: 'text-amber-500', error: 'text-destructive', off: 'text-muted-foreground' };
function Icon({ s }: { s: St }) {
  const cls = `${dot[s]} shrink-0`;
  if (s === 'ok') return <CheckCircle2 size={16} className={cls} />;
  if (s === 'warn') return <AlertTriangle size={16} className={cls} />;
  if (s === 'error') return <XCircle size={16} className={cls} />;
  return <MinusCircle size={16} className={cls} />;
}

export function IntegrationStatus({ shopId, address, provider }: { shopId: string; address: string; provider: 'iiko' | 'poster' | 'rosta' }) {
  const [items, setItems] = useState<StatusItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true); setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('integration-status', { body: { shopId, address, provider } });
      if (myReq !== reqIdRef.current) return; // пришёл ответ на устаревший запрос
      if (error) { let m = error.message; try { const b = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.(); if (b?.error) m = b.error; } catch { /* ignore */ } throw new Error(m); }
      if (data?.error) throw new Error(data.error);
      setItems(data.items || []);
      setCheckedAt(data.checkedAt || new Date().toISOString());
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : 'Не удалось получить статус');
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [shopId, address, provider]);

  // Загрузка при монтировании/смене адреса+провайдера + авто-обновление каждые 5 мин.
  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const overall: St = items ? (items.some(i => i.status === 'error') ? 'error' : items.some(i => i.status === 'warn') ? 'warn' : 'ok') : 'off';

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Activity size={16} className={items ? dot[overall] : 'text-muted-foreground'} /> Статус интеграции
        </h3>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs font-medium text-primary disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Обновить
        </button>
      </div>

      {errorMsg && <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">{errorMsg}</p>}

      {!items && loading && <div className="flex justify-center py-3"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>}

      {items && (
        <div className="space-y-1.5">
          {items.map(it => (
            <div key={it.key} className="flex items-center gap-2 text-sm">
              <Icon s={it.status} />
              <span className="text-foreground">{it.label}</span>
              <span className="text-muted-foreground truncate ml-auto text-right">{it.detail}</span>
            </div>
          ))}
        </div>
      )}

      {checkedAt && (
        <p className="text-[11px] text-muted-foreground">
          Обновлено: {new Date(checkedAt).toLocaleTimeString('ru')} · авто-обновление каждые 5 мин
        </p>
      )}
    </section>
  );
}
