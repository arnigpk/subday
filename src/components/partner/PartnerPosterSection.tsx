import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, MapPin, ListChecks, Trash2, XCircle, CheckCircle2, Search, RefreshCw } from 'lucide-react';
import { IntegrationStatus } from '@/components/partner/IntegrationStatus';

interface Spot { id: string; name: string; address?: string }
interface Product { id: string; name: string; price: number | null } // price в копейках
interface SubType { id: string; name: string; type: string }
interface OrderLog { id: string; status: string; iiko_product_name: string | null; error: string | null; created_at: string; is_test?: boolean; pos_order_id?: string | null; auto_retry?: boolean; attempts?: number }

const selectCls = 'w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground';
const tg = (kopecks: number | null | undefined) => kopecks == null ? '' : `${(Number(kopecks) / 100).toLocaleString('ru')}₸`;

export function PartnerPosterSection({ shopId, address }: { shopId: string; address: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [integ, setInteg] = useState<any>(null);
  const [subTypes, setSubTypes] = useState<SubType[]>([]);
  const [menuMap, setMenuMap] = useState<Record<string, any>>({});
  const [orderLog, setOrderLog] = useState<OrderLog[]>([]);
  const [apiToken, setApiToken] = useState('');
  const [spots, setSpots] = useState<Spot[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState<{ products?: boolean }>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [testSubType, setTestSubType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [i, s, mm, ol] = await Promise.all([
      supabase.from('poster_integrations').select('shop_id, account_name, spot_id, spot_name, currency, auto_close, is_active').eq('shop_id', shopId).eq('address', address).maybeSingle(),
      supabase.from('subscription_types').select('id, name, type').eq('is_active', true).order('sort_order'),
      supabase.from('poster_menu_map').select('*').eq('shop_id', shopId).eq('address', address),
      supabase.from('iiko_order_log').select('id, status, iiko_product_name, error, created_at, is_test, pos_order_id, auto_retry, attempts').eq('shop_id', shopId).eq('provider', 'poster').eq('integration_address', address).order('created_at', { ascending: false }).limit(30),
    ]);
    setInteg(i.data);
    setSubTypes((s.data as SubType[]) || []);
    const mmMap: Record<string, any> = {}; (mm.data || []).forEach((r: any) => { mmMap[r.subscription_type_id] = r; }); setMenuMap(mmMap);
    setOrderLog((ol.data as OrderLog[]) || []);
    setLoading(false);
  }, [shopId, address]);

  useEffect(() => { load(); }, [load]);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('poster-connect', { body: { action, shopId, address, ...extra } });
    if (error) {
      let msg = error.message;
      try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const saveInteg = async (patch: Record<string, unknown>, label?: string) => {
    const { error } = await supabase.from('poster_integrations').update({ ...patch, updated_at: new Date().toISOString() }).eq('shop_id', shopId).eq('address', address);
    if (error) { toast.error('Не сохранилось: ' + error.message); return false; }
    setInteg((p: any) => ({ ...p, ...patch }));
    if (label) toast.success(label);
    return true;
  };

  const handleConnect = async () => {
    if (!apiToken.trim()) { toast.error('Введите токен Poster'); return; }
    setBusy('connect');
    try {
      const d = await call('connect', { apiToken: apiToken.trim() });
      setSpots(d.spots || []);
      toast.success('Токен подключён. Выберите точку.');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const loadSpots = async () => {
    setBusy('spots');
    try { const d = await call('spots'); setSpots(d.spots || []); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const loadProducts = async () => {
    setBusy('products');
    try { const d = await call('products'); setProducts(d.products || []); setLoaded(f => ({ ...f, products: true })); toast.success(`Загружено позиций: ${d.products?.length || 0}`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const selectSpot = async (spotId: string) => {
    const s = spots.find(x => x.id === spotId);
    if (s) await saveInteg({ spot_id: s.id, spot_name: s.name }, 'Точка выбрана');
  };

  const pickProduct = async (subTypeId: string, p: Product) => {
    const row = { shop_id: shopId, address, subscription_type_id: subTypeId, poster_product_id: p.id, poster_product_name: p.name, poster_price: p.price };
    const { error } = await supabase.from('poster_menu_map').upsert(row, { onConflict: 'shop_id,address,subscription_type_id' });
    if (error) { toast.error(error.message); return; }
    setMenuMap(m => ({ ...m, [subTypeId]: row }));
    setPickerFor(null); setProductSearch('');
    toast.success(`${p.name} привязан`);
  };

  const toggleActive = async (v: boolean) => {
    if (v) {
      if (!integ?.spot_id) { toast.error('Выберите точку'); return; }
      if (Object.keys(menuMap).length === 0) { toast.error('Привяжите хотя бы один тариф'); return; }
      // 1 активная интеграция на АДРЕС — гасим iiko и Rosta этого адреса.
      await supabase.from('iiko_integrations').update({ is_active: false }).eq('shop_id', shopId).eq('address', address);
      await supabase.from('rosta_integrations').update({ is_active: false }).eq('shop_id', shopId).eq('address', address);
    }
    await saveInteg({ is_active: v }, v ? 'Poster включён (iiko и Rosta адреса выключены)' : 'Poster выключен');
  };

  const disconnect = async () => {
    if (!confirm('Отключить интеграцию Poster? Настройки и привязки тарифов будут удалены.')) return;
    setBusy('disconnect');
    try {
      await supabase.from('poster_menu_map').delete().eq('shop_id', shopId).eq('address', address);
      await supabase.from('poster_integrations').delete().eq('shop_id', shopId).eq('address', address);
      toast.success('Poster отключён');
      setInteg(null); setMenuMap({}); setSpots([]); setApiToken('');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const runTestOrder = async () => {
    if (!testSubType) { toast.error('Выберите тариф для теста'); return; }
    setBusy('test');
    try {
      const { data, error } = await supabase.functions.invoke('poster-connect', { body: { action: 'test_order', shopId, address, subscriptionTypeId: testSubType } });
      if (error) { let msg = error.message; try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ } throw new Error(msg); }
      if (data?.ok) toast.success('Тестовый заказ отправлен ✓ Проверьте кассу Poster (отменить — ниже)'); else toast.error(data?.error || 'Ошибка тестового заказа');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const orderAction = async (o: OrderLog, action: 'retry' | 'cancel') => {
    if (action === 'retry' && o.auto_retry === false &&
      !confirm('Этот заказ мог уже уйти на кассу (обрыв связи при отправке). Проверьте кассу — если чека там нет, повторите. Иначе возможен повторный чек.\n\nВсё равно повторить?')) return;
    setBusy(action + o.id);
    try {
      const { data, error } = await supabase.functions.invoke('iiko-order', { body: { action, logId: o.id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(action === 'retry'
        ? ((data?.status === 'created' || data?.status === 'closed') ? 'Заказ создан ✓' : `Статус: ${data?.status || '—'}`)
        : (data?.note || 'Заказ отменён'));
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  const connected = !!integ;
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <div className="space-y-5">
      <IntegrationStatus shopId={shopId} address={address} provider="poster" />
      {/* 1. Подключение */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span> Подключение</h3>
        {!connected ? (
          <>
            <p className="text-sm text-muted-foreground">Введите токен Poster (формат <code>account:hash</code> — из вашего аккаунта Poster).</p>
            <div className="flex gap-2">
              <Input value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="account:hash" />
              <Button onClick={handleConnect} disabled={busy === 'connect'}>{busy === 'connect' ? <Loader2 className="animate-spin" size={16} /> : 'Подключить'}</Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-foreground flex items-center gap-2"><CheckCircle2 size={16} className="text-accent" /> Токен подключён{integ.account_name ? ` (аккаунт ${integ.account_name})` : ''}</div>
        )}
      </section>

      {connected && (
        <>
          {/* 2. Точка */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><MapPin size={16} className="text-primary" /> Точка (заведение)</h3>
            <div className="flex gap-2">
              <select className={selectCls} value={integ?.spot_id || ''} onChange={e => selectSpot(e.target.value)}>
                <option value="">— выберите —</option>
                {integ?.spot_id && !spots.some(s => s.id === integ.spot_id) && <option value={integ.spot_id}>{integ.spot_name}</option>}
                {spots.map(s => <option key={s.id} value={s.id}>{s.name}{s.address ? ` · ${s.address}` : ''}</option>)}
              </select>
              <Button variant="outline" onClick={loadSpots} disabled={busy === 'spots'}>{busy === 'spots' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
            </div>
          </section>

          {/* 3. Автозакрытие */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">Автозакрытие чека</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Вкл — заказ помечается предоплаченным (закрыт). Выкл — падает открытым, кассир закрывает.</p>
              </div>
              <Switch checked={!!integ?.auto_close} onCheckedChange={v => saveInteg({ auto_close: v }, v ? 'Автозакрытие включено' : 'Автозакрытие выключено')} />
            </div>
          </section>

          {/* 4. Тарифы → позиции меню */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><ListChecks size={16} className="text-primary" /> Тарифы → позиции меню</h3>
              <Button variant="outline" size="sm" onClick={loadProducts} disabled={busy === 'products'}>{busy === 'products' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить меню'}</Button>
            </div>
            {loaded.products && products.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">Меню Poster пустое (0 позиций). Проверьте, что для выбранной точки заведены товары.</p>
            )}
            {subTypes.map(st => {
              const m = menuMap[st.id];
              return (
                <div key={st.id} className="rounded-xl bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{st.name} <span className="text-xs text-muted-foreground">({st.type})</span></p>
                      {m ? <p className="text-xs text-accent truncate">→ {m.poster_product_name}{m.poster_price != null ? ` · ${tg(m.poster_price)}` : ''}</p> : <p className="text-xs text-muted-foreground">не привязан</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { if (products.length === 0) { toast.error('Сначала «Загрузить меню»'); return; } setPickerFor(st.id); setProductSearch(''); }}>{m ? 'Изменить' : 'Привязать'}</Button>
                  </div>
                  {pickerFor === st.id && (
                    <div className="mt-2 border-t border-border pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Search size={14} className="text-muted-foreground" />
                        <input autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="поиск позиции…" className="flex-1 h-9 px-2 rounded-lg bg-background border border-border text-sm" />
                        <button className="text-xs text-muted-foreground" onClick={() => setPickerFor(null)}>✕</button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-1">
                        {filteredProducts.slice(0, 50).map(p => (
                          <button key={p.id} onClick={() => pickProduct(st.id, p)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-background text-sm flex justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            {p.price != null && <span className="text-xs text-muted-foreground shrink-0">{tg(p.price)}</span>}
                          </button>
                        ))}
                        {filteredProducts.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Ничего не найдено</p>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* 5. Тестовый заказ */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-foreground">Тестовый заказ</h3>
            <p className="text-xs text-muted-foreground">Отправит реальный заказ на кассу (без списания) — проверить, что позиция падает и закрывается.</p>
            <select className={selectCls} value={testSubType} onChange={e => setTestSubType(e.target.value)}>
              <option value="">— тариф —</option>
              {subTypes.filter(st => menuMap[st.id]).map(st => <option key={st.id} value={st.id}>{st.name} → {menuMap[st.id]?.poster_product_name}</option>)}
            </select>
            <Button variant="outline" onClick={runTestOrder} disabled={busy === 'test'} className="w-full">{busy === 'test' ? <Loader2 className="animate-spin" size={16} /> : 'Отправить тестовый заказ'}</Button>
          </section>

          {/* 6. Активация + отключение */}
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Интеграция активна</h3>
                <p className="text-xs text-muted-foreground">Заказы падают в кассу только когда включено. Включение Poster выключит iiko.</p>
              </div>
              <Switch checked={!!integ?.is_active} onCheckedChange={toggleActive} />
            </div>
            <Button variant="outline" onClick={disconnect} disabled={busy === 'disconnect'} className="w-full text-destructive border-destructive/40 hover:bg-destructive/10">
              {busy === 'disconnect' ? <Loader2 className="animate-spin" size={16} /> : <><Trash2 size={15} className="mr-2" /> Отключить интеграцию</>}
            </Button>
          </section>

          {/* 7. Заказы Poster */}
          {orderLog.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <h3 className="font-semibold text-foreground">Заказы Poster</h3>
              {orderLog.map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm border-b border-border/50 py-2 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${o.status === 'created' ? 'bg-accent' : o.status === 'failed' ? 'bg-destructive' : o.status === 'cancelled' ? 'bg-muted-foreground' : 'bg-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">
                      {o.is_test && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1">тест</span>}
                      {o.iiko_product_name || '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString('ru')}{o.error ? ` · ${o.error}` : ''}</p>
                  </div>
                  {o.status === 'failed' && !o.is_test && <Button size="sm" variant="ghost" onClick={() => orderAction(o, 'retry')} disabled={busy === 'retry' + o.id} title="Повторить"><RefreshCw size={15} /></Button>}
                  {(o.status === 'created' || o.status === 'closed') && <Button size="sm" variant="ghost" onClick={() => orderAction(o, 'cancel')} disabled={busy === 'cancel' + o.id} title="Отменить"><XCircle size={15} /></Button>}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
