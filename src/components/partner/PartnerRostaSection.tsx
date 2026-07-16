import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, MapPin, CreditCard, ListChecks, Trash2, CheckCircle2, Search, User } from 'lucide-react';

interface Tradepoint { id: string; name: string }
interface Cashbox { id: string; name: string; tradepointId?: string | null }
interface PayMethod { id: string; name: string; type?: number | null }
interface FrontUser { id: string; name: string }
interface PriceType { id: string; name: string }
interface Item { id: string; name: string; price: number | null } // цена в тенге
interface SubType { id: string; name: string; type: string }
interface OrderLog { id: string; status: string; iiko_product_name: string | null; error: string | null; created_at: string; is_test?: boolean; pos_order_id?: string | null }

const selectCls = 'w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground';
const tg = (t: number | null | undefined) => t == null ? '' : `${Number(t).toLocaleString('ru')}₸`;

export function PartnerRostaSection({ shopId }: { shopId: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [integ, setInteg] = useState<any>(null);
  const [subTypes, setSubTypes] = useState<SubType[]>([]);
  const [menuMap, setMenuMap] = useState<Record<string, any>>({});
  const [orderLog, setOrderLog] = useState<OrderLog[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [tradepoints, setTradepoints] = useState<Tradepoint[]>([]);
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [payMethods, setPayMethods] = useState<PayMethod[]>([]);
  const [users, setUsers] = useState<FrontUser[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState<{ items?: boolean }>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [testSubType, setTestSubType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [i, s, mm, ol] = await Promise.all([
      supabase.from('rosta_integrations').select('shop_id, tradepoint_id, tradepoint_name, cashbox_id, cashbox_name, payment_method_id, payment_method_name, user_id, user_name, price_type_id, price_type_name, auto_open_shift, currency, auto_close, is_active').eq('shop_id', shopId).maybeSingle(),
      supabase.from('subscription_types').select('id, name, type').eq('is_active', true).order('sort_order'),
      supabase.from('rosta_menu_map').select('*').eq('shop_id', shopId),
      supabase.from('iiko_order_log').select('id, status, iiko_product_name, error, created_at, is_test, pos_order_id').eq('shop_id', shopId).eq('provider', 'rosta').order('created_at', { ascending: false }).limit(30),
    ]);
    setInteg(i.data);
    setSubTypes((s.data as SubType[]) || []);
    const mmMap: Record<string, any> = {}; (mm.data || []).forEach((r: any) => { mmMap[r.subscription_type_id] = r; }); setMenuMap(mmMap);
    setOrderLog((ol.data as OrderLog[]) || []);
    setLoading(false);
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('rosta-connect', { body: { action, shopId, ...extra } });
    if (error) {
      let msg = error.message;
      try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const saveInteg = async (patch: Record<string, unknown>, label?: string) => {
    const { error } = await supabase.from('rosta_integrations').update({ ...patch, updated_at: new Date().toISOString() }).eq('shop_id', shopId);
    if (error) { toast.error('Не сохранилось: ' + error.message); return false; }
    setInteg((p: any) => ({ ...p, ...patch }));
    if (label) toast.success(label);
    return true;
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) { toast.error('Введите API-ключ Rosta'); return; }
    setBusy('connect');
    try {
      const d = await call('connect', { apiKey: apiKey.trim() });
      setTradepoints(d.tradepoints || []);
      toast.success('Ключ подключён. Выберите точку.');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const loadList = async (key: string, action: string, setter: (v: any[]) => void, field: string) => {
    setBusy(key);
    try { const d = await call(action); setter(d[field] || []); if (!(d[field] || []).length) toast.info('Список пуст'); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const loadItems = async () => {
    setBusy('items');
    try { const d = await call('items'); setItems(d.items || []); setLoaded(f => ({ ...f, items: true })); toast.success(`Загружено позиций: ${d.items?.length || 0}`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const selectTradepoint = async (id: string) => {
    const t = tradepoints.find(x => x.id === id);
    if (t) await saveInteg({ tradepoint_id: t.id, tradepoint_name: t.name }, 'Точка выбрана');
  };
  const selectCashbox = async (id: string) => {
    const c = cashboxes.find(x => x.id === id);
    if (c) await saveInteg({ cashbox_id: c.id, cashbox_name: c.name }, 'Касса выбрана');
  };
  const selectPayMethod = async (id: string) => {
    const m = payMethods.find(x => x.id === id);
    if (m) await saveInteg({ payment_method_id: m.id, payment_method_name: m.name }, 'Способ оплаты выбран');
  };
  const selectUser = async (id: string) => {
    const u = users.find(x => x.id === id);
    if (u) await saveInteg({ user_id: u.id, user_name: u.name }, 'Сотрудник выбран');
  };

  const pickItem = async (subTypeId: string, it: Item) => {
    const row = { shop_id: shopId, subscription_type_id: subTypeId, rosta_item_id: it.id, rosta_item_name: it.name, rosta_price: it.price };
    const { error } = await supabase.from('rosta_menu_map').upsert(row, { onConflict: 'shop_id,subscription_type_id' });
    if (error) { toast.error(error.message); return; }
    setMenuMap(m => ({ ...m, [subTypeId]: row }));
    setPickerFor(null); setItemSearch('');
    toast.success(`${it.name} привязан`);
  };

  const toggleActive = async (v: boolean) => {
    if (v) {
      if (!integ?.tradepoint_id) { toast.error('Выберите торговую точку'); return; }
      if (Object.keys(menuMap).length === 0) { toast.error('Привяжите хотя бы один тариф'); return; }
      if (integ?.auto_close && (!integ?.cashbox_id || !integ?.payment_method_id)) {
        toast.error('Для автозакрытия выберите кассу и способ оплаты'); return;
      }
      if (integ?.auto_open_shift && !integ?.user_id) {
        toast.error('Для авто-открытия смены выберите сотрудника'); return;
      }
      // 1 активная интеграция на партнёра — гасим iiko и Poster.
      await supabase.from('iiko_integrations').update({ is_active: false }).eq('shop_id', shopId);
      await supabase.from('poster_integrations').update({ is_active: false }).eq('shop_id', shopId);
    }
    await saveInteg({ is_active: v }, v ? 'Rosta включён (iiko и Poster выключены)' : 'Rosta выключен');
  };

  const disconnect = async () => {
    if (!confirm('Отключить интеграцию Rosta? Настройки и привязки тарифов будут удалены.')) return;
    setBusy('disconnect');
    try {
      await supabase.from('rosta_menu_map').delete().eq('shop_id', shopId);
      await supabase.from('rosta_integrations').delete().eq('shop_id', shopId);
      toast.success('Rosta отключён');
      setInteg(null); setMenuMap({}); setTradepoints([]); setApiKey('');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const runTestOrder = async () => {
    if (!testSubType) { toast.error('Выберите тариф для теста'); return; }
    setBusy('test');
    try {
      const { data, error } = await supabase.functions.invoke('rosta-connect', { body: { action: 'test_order', shopId, subscriptionTypeId: testSubType } });
      if (error) { let msg = error.message; try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ } throw new Error(msg); }
      if (data?.ok) toast.success('Тестовый заказ отправлен ✓ Проверьте кассу Rosta'); else toast.error(data?.error || 'Ошибка тестового заказа');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  const connected = !!integ;
  const cashForPoint = cashboxes.filter(c => !c.tradepointId || !integ?.tradepoint_id || c.tradepointId === integ.tradepoint_id);
  const filteredItems = items.filter(p => p.name.toLowerCase().includes(itemSearch.toLowerCase()));

  return (
    <div className="space-y-5">
      {/* 1. Подключение */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span> Подключение</h3>
        {!connected ? (
          <>
            <p className="text-sm text-muted-foreground">Введите API-ключ Rosta (из личного кабинета Rosta). Ключ у каждой кофейни свой.</p>
            <div className="flex gap-2">
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API-ключ" />
              <Button onClick={handleConnect} disabled={busy === 'connect'}>{busy === 'connect' ? <Loader2 className="animate-spin" size={16} /> : 'Подключить'}</Button>
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
              <select className={selectCls} value={integ?.tradepoint_id || ''} onChange={e => selectTradepoint(e.target.value)}>
                <option value="">— выберите —</option>
                {integ?.tradepoint_id && !tradepoints.some(t => t.id === integ.tradepoint_id) && <option value={integ.tradepoint_id}>{integ.tradepoint_name}</option>}
                {tradepoints.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Button variant="outline" onClick={() => loadList('tradepoints', 'tradepoints', setTradepoints, 'tradepoints')} disabled={busy === 'tradepoints'}>{busy === 'tradepoints' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
            </div>
          </section>

          {/* 3. Касса + способ оплаты (для закрытия чека) */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><CreditCard size={16} className="text-primary" /> Касса и способ оплаты</h3>
            <p className="text-xs text-muted-foreground">Нужны для автозакрытия чека. Способ оплаты выбираете сами — как удобнее (наличные, безнал, отдельный «subday»).</p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <select className={selectCls} value={integ?.cashbox_id || ''} onChange={e => selectCashbox(e.target.value)}>
                  <option value="">— касса —</option>
                  {integ?.cashbox_id && !cashboxes.some(c => c.id === integ.cashbox_id) && <option value={integ.cashbox_id}>{integ.cashbox_name}</option>}
                  {cashForPoint.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button variant="outline" onClick={() => loadList('cashboxes', 'cashboxes', setCashboxes, 'cashboxes')} disabled={busy === 'cashboxes'}>{busy === 'cashboxes' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
              </div>
              <div className="flex gap-2">
                <select className={selectCls} value={integ?.payment_method_id || ''} onChange={e => selectPayMethod(e.target.value)}>
                  <option value="">— способ оплаты —</option>
                  {integ?.payment_method_id && !payMethods.some(m => m.id === integ.payment_method_id) && <option value={integ.payment_method_id}>{integ.payment_method_name}</option>}
                  {payMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <Button variant="outline" onClick={() => loadList('pay', 'payment_methods', setPayMethods, 'paymentMethods')} disabled={busy === 'pay'}>{busy === 'pay' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
              </div>
            </div>
          </section>

          {/* 4. Смена */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><User size={16} className="text-primary" /> Смена</h3>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Авто-открытие смены</p>
                <p className="text-xs text-muted-foreground mt-0.5">Если смена на кассе не открыта — открыть автоматически. Обычно партнёр держит смену открытой; это резерв.</p>
              </div>
              <Switch checked={!!integ?.auto_open_shift} onCheckedChange={v => saveInteg({ auto_open_shift: v }, v ? 'Авто-открытие включено' : 'Авто-открытие выключено')} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Сотрудник (для открытия смены)</label>
              <div className="flex gap-2 mt-1">
                <select className={selectCls} value={integ?.user_id || ''} onChange={e => selectUser(e.target.value)}>
                  <option value="">— сотрудник —</option>
                  {integ?.user_id && !users.some(u => u.id === integ.user_id) && <option value={integ.user_id}>{integ.user_name}</option>}
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <Button variant="outline" onClick={() => loadList('users', 'users', setUsers, 'users')} disabled={busy === 'users'}>{busy === 'users' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
              </div>
            </div>
          </section>

          {/* 5. Автозакрытие */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">Автозакрытие чека</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Вкл — чек сразу закрывается (оплачивается) на выбранную кассу и способ оплаты. Выкл — падает открытым, кассир закрывает.</p>
              </div>
              <Switch checked={!!integ?.auto_close} onCheckedChange={v => saveInteg({ auto_close: v }, v ? 'Автозакрытие включено' : 'Автозакрытие выключено')} />
            </div>
          </section>

          {/* 6. Тарифы → позиции меню */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><ListChecks size={16} className="text-primary" /> Тарифы → позиции меню</h3>
              <Button variant="outline" size="sm" onClick={loadItems} disabled={busy === 'items'}>{busy === 'items' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить меню'}</Button>
            </div>
            {loaded.items && items.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">Меню Rosta пустое (0 позиций). Проверьте, что в Rosta заведены товары/услуги.</p>
            )}
            {subTypes.map(st => {
              const m = menuMap[st.id];
              return (
                <div key={st.id} className="rounded-xl bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{st.name} <span className="text-xs text-muted-foreground">({st.type})</span></p>
                      {m ? <p className="text-xs text-accent truncate">→ {m.rosta_item_name}{m.rosta_price != null ? ` · ${tg(m.rosta_price)}` : ''}</p> : <p className="text-xs text-muted-foreground">не привязан</p>}
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

          {/* 7. Тестовый заказ */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">Тестовый заказ</h3>
            <p className="text-xs text-muted-foreground">Отправит реальный чек на кассу (без списания) — проверить, что позиция падает и закрывается.</p>
            <select className={selectCls} value={testSubType} onChange={e => setTestSubType(e.target.value)}>
              <option value="">— тариф —</option>
              {subTypes.filter(st => menuMap[st.id]).map(st => <option key={st.id} value={st.id}>{st.name} → {menuMap[st.id]?.rosta_item_name}</option>)}
            </select>
            <Button variant="outline" onClick={runTestOrder} disabled={busy === 'test'} className="w-full">{busy === 'test' ? <Loader2 className="animate-spin" size={16} /> : 'Отправить тестовый заказ'}</Button>
          </section>

          {/* 8. Вид цены (необязательно) */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">Вид цены <span className="text-xs text-muted-foreground font-normal">(необязательно)</span></h3>
            <p className="text-xs text-muted-foreground">По умолчанию — «Розница». Смените, если для меню нужен другой вид цены. После смены перезагрузите меню.</p>
            <div className="flex gap-2">
              <select className={selectCls} value={integ?.price_type_id || ''} onChange={e => { const pt = priceTypes.find(x => x.id === e.target.value); saveInteg({ price_type_id: pt?.id || null, price_type_name: pt?.name || null }, 'Вид цены сохранён'); }}>
                <option value="">Розница (по умолчанию)</option>
                {integ?.price_type_id && !priceTypes.some(p => p.id === integ.price_type_id) && <option value={integ.price_type_id}>{integ.price_type_name}</option>}
                {priceTypes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button variant="outline" onClick={() => loadList('price_types', 'price_types', setPriceTypes, 'priceTypes')} disabled={busy === 'price_types'}>{busy === 'price_types' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
            </div>
          </section>

          {/* 9. Активация + отключение */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Интеграция активна</h3>
                <p className="text-xs text-muted-foreground">Заказы падают в кассу только когда включено. Включение Rosta выключит iiko и Poster.</p>
              </div>
              <Switch checked={!!integ?.is_active} onCheckedChange={toggleActive} />
            </div>
            <Button variant="outline" onClick={disconnect} disabled={busy === 'disconnect'} className="w-full text-destructive border-destructive/40 hover:bg-destructive/10">
              {busy === 'disconnect' ? <Loader2 className="animate-spin" size={16} /> : <><Trash2 size={15} className="mr-2" /> Отключить интеграцию</>}
            </Button>
          </section>

          {/* 10. Заказы Rosta */}
          {orderLog.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <h3 className="font-semibold text-foreground">Заказы Rosta</h3>
              <p className="text-[11px] text-muted-foreground">Отмена чека в Rosta делается вручную на кассе (публичный API отмену не поддерживает).</p>
              {orderLog.map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm border-b border-border/50 py-2 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${o.status === 'created' || o.status === 'closed' ? 'bg-accent' : o.status === 'failed' ? 'bg-destructive' : o.status === 'cancelled' ? 'bg-muted-foreground' : 'bg-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">
                      {o.is_test && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1">тест</span>}
                      {o.iiko_product_name || '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString('ru')}{o.error ? ` · ${o.error}` : ''}</p>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
