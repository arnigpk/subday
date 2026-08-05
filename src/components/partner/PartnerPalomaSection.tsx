import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, MapPin, ListChecks, Trash2, CheckCircle2, Search, RefreshCw, XCircle } from 'lucide-react';
import { IntegrationStatus } from '@/components/partner/IntegrationStatus';

interface Point { id: string; name: string; address?: string }
interface Item { id: string; name: string; price: number | null } // цена в тенге
interface SubType { id: string; name: string; type: string }
interface OrderLog { id: string; status: string; iiko_product_name: string | null; error: string | null; created_at: string; is_test?: boolean; pos_order_id?: string | null; auto_retry?: boolean; attempts?: number; pos_status?: string | null; cancel_origin?: string | null }

// Метка отмены: кто отменил — subday или касса.
function CancelBadge({ o }: { o: { status: string; pos_status?: string | null; cancel_origin?: string | null } }) {
  if (o.status !== 'cancelled' && o.pos_status !== 'cancelled') return null;
  const pos = o.cancel_origin === 'pos' || (o.cancel_origin == null && o.pos_status === 'cancelled');
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1 ${pos ? 'bg-amber-500/15 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
      {pos ? 'Отмена на кассе' : 'Отмена SB'}
    </span>
  );
}

const selectCls = 'w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground';
const tg = (t: number | null | undefined) => t == null ? '' : `${Number(t).toLocaleString('ru')}₸`;

export function PartnerPalomaSection({ shopId, address }: { shopId: string; address: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [integ, setInteg] = useState<any>(null);
  const [subTypes, setSubTypes] = useState<SubType[]>([]);
  const [menuMap, setMenuMap] = useState<Record<string, any>>({});
  const [orderLog, setOrderLog] = useState<OrderLog[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [connectorClass, setConnectorClass] = useState('Tester'); // эталонный коннектор Paloma по умолчанию
  const [points, setPoints] = useState<Point[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadedItems, setLoadedItems] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [testSubType, setTestSubType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [i, s, mm, ol] = await Promise.all([
      supabase.from('paloma_integrations').select('shop_id, connector_class, point_id, point_name, currency, is_active').eq('shop_id', shopId).eq('address', address).maybeSingle(),
      supabase.from('subscription_types').select('id, name, type').eq('is_active', true).order('sort_order'),
      supabase.from('paloma_menu_map').select('*').eq('shop_id', shopId).eq('address', address),
      supabase.from('iiko_order_log').select('id, status, iiko_product_name, error, created_at, is_test, pos_order_id, auto_retry, attempts, pos_status, cancel_origin').eq('shop_id', shopId).eq('provider', 'paloma').eq('integration_address', address).order('created_at', { ascending: false }).limit(30),
    ]);
    setInteg(i.data);
    setSubTypes((s.data as SubType[]) || []);
    const mmMap: Record<string, any> = {}; (mm.data || []).forEach((r: any) => { mmMap[r.subscription_type_id] = r; }); setMenuMap(mmMap);
    setOrderLog((ol.data as OrderLog[]) || []);
    setLoading(false);
  }, [shopId, address]);

  useEffect(() => { load(); }, [load]);

  // Разовая фоновая сверка статуса заказов Paloma (выдан/отменён на кассе) — только отображение.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || !integ?.is_active) return;
    syncedRef.current = true;
    (async () => {
      try {
        await supabase.functions.invoke('paloma-connect', { body: { action: 'sync_statuses', shopId, address } });
        const { data } = await supabase.from('iiko_order_log')
          .select('id, status, iiko_product_name, error, created_at, is_test, pos_order_id, auto_retry, attempts, pos_status, cancel_origin')
          .eq('shop_id', shopId).eq('provider', 'paloma').eq('integration_address', address)
          .order('created_at', { ascending: false }).limit(30);
        if (data) setOrderLog(data as OrderLog[]);
      } catch { /* фоновая сверка — не критично */ }
    })();
  }, [integ?.is_active, shopId, address]);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('paloma-connect', { body: { action, shopId, address, ...extra } });
    if (error) {
      let msg = error.message;
      try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const saveInteg = async (patch: Record<string, unknown>, label?: string) => {
    const { error } = await supabase.from('paloma_integrations').update({ ...patch, updated_at: new Date().toISOString() }).eq('shop_id', shopId).eq('address', address);
    if (error) { toast.error('Не сохранилось: ' + error.message); return false; }
    setInteg((p: any) => ({ ...p, ...patch }));
    if (label) toast.success(label);
    return true;
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) { toast.error('Введите authkey Paloma'); return; }
    if (!connectorClass.trim()) { toast.error('Введите класс коннектора Paloma'); return; }
    setBusy('connect');
    try {
      const d = await call('connect', { apiKey: apiKey.trim(), connectorClass: connectorClass.trim() });
      setPoints(d.points || []);
      toast.success('Ключ подключён. Выберите точку.');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const loadPoints = async () => {
    setBusy('points');
    try { const d = await call('points'); setPoints(d.points || []); if (!(d.points || []).length) toast.info('Список точек пуст'); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const loadItems = async () => {
    if (!integ?.point_id) { toast.error('Сначала выберите торговую точку'); return; }
    setBusy('items');
    try { const d = await call('menu'); setItems(d.items || []); setLoadedItems(true); toast.success(`Загружено позиций: ${d.items?.length || 0}`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const selectPoint = async (id: string) => {
    const t = points.find(x => x.id === id);
    if (t) await saveInteg({ point_id: t.id, point_name: t.name }, 'Точка выбрана');
  };

  const pickItem = async (subTypeId: string, it: Item) => {
    const row = { shop_id: shopId, address, subscription_type_id: subTypeId, paloma_item_id: it.id, paloma_item_name: it.name, paloma_price: it.price };
    const { error } = await supabase.from('paloma_menu_map').upsert(row, { onConflict: 'shop_id,address,subscription_type_id' });
    if (error) { toast.error(error.message); return; }
    setMenuMap(m => ({ ...m, [subTypeId]: row }));
    setPickerFor(null); setItemSearch('');
    toast.success(`${it.name} привязан`);
  };

  const toggleActive = async (v: boolean) => {
    if (v) {
      if (!integ?.point_id) { toast.error('Выберите торговую точку'); return; }
      if (Object.keys(menuMap).length === 0) { toast.error('Привяжите хотя бы один тариф'); return; }
      // 1 активная интеграция на АДРЕС — гасим iiko, Poster и Rosta этого адреса.
      await supabase.from('iiko_integrations').update({ is_active: false }).eq('shop_id', shopId).eq('address', address);
      await supabase.from('poster_integrations').update({ is_active: false }).eq('shop_id', shopId).eq('address', address);
      await supabase.from('rosta_integrations').update({ is_active: false }).eq('shop_id', shopId).eq('address', address);
    }
    await saveInteg({ is_active: v }, v ? 'Paloma включён (iiko, Poster и Rosta адреса выключены)' : 'Paloma выключен');
  };

  const disconnect = async () => {
    if (!confirm('Отключить интеграцию Paloma? Настройки и привязки тарифов будут удалены.')) return;
    setBusy('disconnect');
    try {
      await supabase.from('paloma_menu_map').delete().eq('shop_id', shopId).eq('address', address);
      await supabase.from('paloma_integrations').delete().eq('shop_id', shopId).eq('address', address);
      toast.success('Paloma отключён');
      setInteg(null); setMenuMap({}); setPoints([]); setApiKey(''); setConnectorClass('');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const runTestOrder = async () => {
    if (!testSubType) { toast.error('Выберите тариф для теста'); return; }
    setBusy('test');
    try {
      const { data, error } = await supabase.functions.invoke('paloma-connect', { body: { action: 'test_order', shopId, address, subscriptionTypeId: testSubType } });
      if (error) { let msg = error.message; try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ } throw new Error(msg); }
      if (data?.ok) toast.success('Тестовый заказ отправлен ✓ Проверьте Paloma'); else toast.error(data?.error || 'Ошибка тестового заказа');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const orderAction = async (o: OrderLog, action: 'retry' | 'cancel') => {
    if (action === 'retry' && o.auto_retry === false &&
      !confirm('Этот заказ мог уже уйти в Paloma (обрыв связи при отправке). Проверьте Paloma — если заказа там нет, повторите. Иначе возможен дубль.\n\nВсё равно повторить?')) return;
    setBusy(action + o.id);
    try {
      const { data, error } = await supabase.functions.invoke('iiko-order', { body: { action, logId: o.id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(action === 'retry' ? (data?.status === 'created' ? 'Заказ создан ✓' : `Статус: ${data?.status || '—'}`) : (data?.note || 'Заказ отменён'));
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  const connected = !!integ;
  const filteredItems = items.filter(p => p.name.toLowerCase().includes(itemSearch.toLowerCase()));

  return (
    <div className="space-y-5">
      <IntegrationStatus shopId={shopId} address={address} provider="paloma" />

      {/* 1. Подключение */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span> Подключение</h3>
        {!connected ? (
          <>
            <p className="text-sm text-muted-foreground"><b>authkey</b> — ключ API из Paloma: «Предприятие → Управление → Настройки аккаунта» (если поле пустое — кнопка «Генерировать API AUTHKEY»). У каждой кофейни свой.</p>
            <div className="space-y-2">
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="authkey" />
              <Input value={connectorClass} onChange={e => setConnectorClass(e.target.value)} placeholder="класс коннектора (Tester)" />
              <div className="text-[11px] text-muted-foreground bg-secondary/40 rounded-lg p-2 leading-relaxed">
                <b>Класс коннектора</b> — «класс подключаемого сервиса» доставки в Paloma; по нему Paloma узнаёт нашу интеграцию. Стандартное значение — <b>Tester</b> (оставьте как есть). Если поддержка Paloma завела вам отдельный коннектор — впишите его класс. При «Подключить» ключ и класс сразу проверяются (подтягиваем список точек) — при неверном классе будет ошибка.
              </div>
              <Button onClick={handleConnect} disabled={busy === 'connect'} className="w-full">{busy === 'connect' ? <Loader2 className="animate-spin" size={16} /> : 'Подключить'}</Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-foreground flex items-center gap-2"><CheckCircle2 size={16} className="text-accent" /> Ключ подключён</div>
        )}
      </section>

      {connected && (
        <>
          {/* 2. Точка */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><MapPin size={16} className="text-primary" /> Торговая точка</h3>
            <div className="flex gap-2">
              <select className={selectCls} value={integ?.point_id || ''} onChange={e => selectPoint(e.target.value)}>
                <option value="">— выберите —</option>
                {integ?.point_id && !points.some(t => t.id === integ.point_id) && <option value={integ.point_id}>{integ.point_name}</option>}
                {points.map(t => <option key={t.id} value={t.id}>{t.name}{t.address ? ` · ${t.address}` : ''}</option>)}
              </select>
              <Button variant="outline" onClick={loadPoints} disabled={busy === 'points'}>{busy === 'points' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
            </div>
          </section>

          {/* 3. Тарифы → позиции меню */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><ListChecks size={16} className="text-primary" /> Тарифы → позиции меню</h3>
              <Button variant="outline" size="sm" onClick={loadItems} disabled={busy === 'items'}>{busy === 'items' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить меню'}</Button>
            </div>
            {loadedItems && items.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">Меню Paloma пустое (0 позиций). Проверьте, что в выбранной точке заведены товары.</p>
            )}
            {subTypes.map(st => {
              const m = menuMap[st.id];
              return (
                <div key={st.id} className="rounded-xl bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{st.name} <span className="text-xs text-muted-foreground">({st.type})</span></p>
                      {m ? <p className="text-xs text-accent truncate">→ {m.paloma_item_name}{m.paloma_price != null ? ` · ${tg(m.paloma_price)}` : ''}</p> : <p className="text-xs text-muted-foreground">не привязан</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { if (items.length === 0) { toast.error('Сначала «Загрузить меню»'); return; } setPickerFor(st.id); setItemSearch(''); }}>{m ? 'Изменить' : 'Привязать'}</Button>
                  </div>
                  {pickerFor === st.id && (
                    <div className="mt-2 border-t border-border pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Search size={14} className="text-muted-foreground" />
                        <input autoFocus value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="поиск позиции…" className="flex-1 h-9 px-2 rounded-lg bg-background border border-border text-sm" />
                        <button className="text-xs text-muted-foreground" onClick={() => setPickerFor(null)}>✕</button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-1">
                        {filteredItems.slice(0, 50).map(p => (
                          <button key={p.id} onClick={() => pickItem(st.id, p)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-background text-sm flex justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            {p.price != null && <span className="text-xs text-muted-foreground shrink-0">{tg(p.price)}</span>}
                          </button>
                        ))}
                        {filteredItems.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Ничего не найдено</p>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* 4. Тестовый заказ */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">Тестовый заказ</h3>
            <p className="text-xs text-muted-foreground">Отправит реальный заказ в Paloma (без списания) — проверить, что позиция падает. Отменить можно ниже, в «Заказы Paloma».</p>
            <select className={selectCls} value={testSubType} onChange={e => setTestSubType(e.target.value)}>
              <option value="">— тариф —</option>
              {subTypes.filter(st => menuMap[st.id]).map(st => <option key={st.id} value={st.id}>{st.name} → {menuMap[st.id]?.paloma_item_name}</option>)}
            </select>
            <Button variant="outline" onClick={runTestOrder} disabled={busy === 'test'} className="w-full">{busy === 'test' ? <Loader2 className="animate-spin" size={16} /> : 'Отправить тестовый заказ'}</Button>
          </section>

          {/* 5. Активация + отключение */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Интеграция активна</h3>
                <p className="text-xs text-muted-foreground">Заказы падают в Paloma только когда включено. Включение Paloma выключит iiko, Poster и Rosta этого адреса.</p>
              </div>
              <Switch checked={!!integ?.is_active} onCheckedChange={toggleActive} />
            </div>
            <Button variant="outline" onClick={disconnect} disabled={busy === 'disconnect'} className="w-full text-destructive border-destructive/40 hover:bg-destructive/10">
              {busy === 'disconnect' ? <Loader2 className="animate-spin" size={16} /> : <><Trash2 size={15} className="mr-2" /> Отключить интеграцию</>}
            </Button>
          </section>

          {/* 6. Заказы Paloma */}
          {orderLog.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <h3 className="font-semibold text-foreground">Заказы Paloma</h3>
              <p className="text-[11px] text-muted-foreground">Упавшие заказы повторяются автоматически (раз в минуту, до 5 раз), затем — кнопкой ↻. Отмена возможна, пока заказ не начали готовить (статус «new»).</p>
              {orderLog.map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm border-b border-border/50 py-2 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${o.status === 'created' || o.status === 'closed' ? 'bg-accent' : o.status === 'failed' ? 'bg-destructive' : o.status === 'cancelled' ? 'bg-muted-foreground' : 'bg-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">
                      {o.is_test && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1">тест</span>}
                      {o.iiko_product_name || '—'}
                      {o.pos_status === 'closed' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent ml-1">выдан на кассе</span>}
                      <CancelBadge o={o} />
                    </p>
                    <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString('ru')}{o.error ? ` · ${o.error}` : ''}</p>
                  </div>
                  {o.status === 'failed' && !o.is_test && <Button size="sm" variant="ghost" onClick={() => orderAction(o, 'retry')} disabled={busy === 'retry' + o.id} title="Повторить"><RefreshCw size={15} /></Button>}
                  {o.status === 'failed' && <Button size="sm" variant="ghost" onClick={() => orderAction(o, 'cancel')} disabled={busy === 'cancel' + o.id} title="Снять с отправки"><XCircle size={15} /></Button>}
                  {(o.status === 'created' || o.status === 'closed') && o.pos_status !== 'closed' && o.pos_status !== 'cancelled' && <Button size="sm" variant="ghost" onClick={() => orderAction(o, 'cancel')} disabled={busy === 'cancel' + o.id} title="Отменить"><XCircle size={15} /></Button>}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
