import { useState, useEffect, useCallback } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Plug, MapPin, CreditCard, ListChecks, Trash2, RefreshCw, XCircle, CheckCircle2, Search } from 'lucide-react';
import { PartnerPosterSection } from '@/components/partner/PartnerPosterSection';
import { PartnerRostaSection } from '@/components/partner/PartnerRostaSection';
import { IntegrationStatus } from '@/components/partner/IntegrationStatus';

interface Org { id: string; name: string }
interface Term { id: string; name: string; address?: string }
interface OrderType { id: string; name: string; orderServiceType: string }
interface PayType { id: string; name: string; paymentTypeKind: string }
interface Product { id: string; name: string; price: number | null }
interface SubType { id: string; name: string; type: string }
interface OrderLog {
  id: string; status: string; address: string | null; iiko_product_name: string | null;
  error: string | null; created_at: string; iiko_order_id: string | null; is_test?: boolean;
}

const selectCls = 'w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground';

export default function PartnerIntegrationPage() {
  const { shopId, isPartner, isLoading: authLoading } = usePartnerAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // integration config (без секрета)
  const [integ, setInteg] = useState<any>(null);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [subTypes, setSubTypes] = useState<SubType[]>([]);
  const [terminalsCfg, setTerminalsCfg] = useState<Record<string, any>>({}); // address -> row
  const [menuMap, setMenuMap] = useState<Record<string, any>>({}); // subTypeId -> row
  const [orderLog, setOrderLog] = useState<OrderLog[]>([]);

  // dictionaries pulled from iiko
  const [apiKey, setApiKey] = useState('');       // основной путь (v2): один ключ из iikoWeb
  const [showLegacy, setShowLegacy] = useState(false); // v1 apiLogin — легаси-fallback
  const [apiLogin, setApiLogin] = useState('');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [terminals, setTerminals] = useState<Term[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([]);
  const [payTypes, setPayTypes] = useState<PayType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null); // subTypeId for product picker
  const [productSearch, setProductSearch] = useState('');
  const [testSubType, setTestSubType] = useState('');
  const [testAddress, setTestAddress] = useState('');
  const [loaded, setLoaded] = useState<{ pay?: boolean; terminals?: boolean; products?: boolean }>({});
  const [provider, setProvider] = useState<'iiko' | 'poster' | 'rosta'>('iiko');
  // Адрес-ключ настраиваемой интеграции: '' = дефолт (все адреса без своей интеграции).
  const [address, setAddress] = useState('');
  // Адреса, у которых ЕСТЬ своя интеграция (для «Кассы по адресам» и подсказок).
  const [ownAddresses, setOwnAddresses] = useState<Set<string>>(new Set());

  // Если у кофейни есть запись Poster/Rosta по текущему адресу — открываем её вкладку.
  useEffect(() => {
    if (!shopId) return;
    supabase.from('poster_integrations').select('is_active').eq('shop_id', shopId).eq('address', address).maybeSingle()
      .then(({ data }) => { if (data) setProvider('poster'); });
    supabase.from('rosta_integrations').select('is_active').eq('shop_id', shopId).eq('address', address).maybeSingle()
      .then(({ data }) => { if (data) setProvider('rosta'); });
  }, [shopId, address]);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    const [i, s, tc, mm, sh, ol, own] = await Promise.all([
      supabase.from('iiko_integrations').select('shop_id, address, organization_id, organization_name, payment_type_id, payment_type_name, payment_type_kind, auto_close, is_active, order_endpoint, fiscalize_externally').eq('shop_id', shopId).eq('address', address).maybeSingle(),
      supabase.from('subscription_types').select('id, name, type').eq('is_active', true).order('sort_order'),
      supabase.from('iiko_terminals').select('*').eq('shop_id', shopId),
      supabase.from('iiko_menu_map').select('*').eq('shop_id', shopId).eq('address', address),
      supabase.from('shops').select('addresses, address').eq('id', shopId).maybeSingle(),
      supabase.from('iiko_order_log').select('id, status, address, iiko_product_name, error, created_at, iiko_order_id, is_test').eq('shop_id', shopId).eq('provider', 'iiko').order('created_at', { ascending: false }).limit(30),
      Promise.all([
        supabase.from('iiko_integrations').select('address').eq('shop_id', shopId).neq('address', ''),
        supabase.from('poster_integrations').select('address').eq('shop_id', shopId).neq('address', ''),
        supabase.from('rosta_integrations').select('address').eq('shop_id', shopId).neq('address', ''),
      ]),
    ]);
    const ownSet = new Set<string>();
    (own || []).forEach(r => (r.data || []).forEach((x: any) => x.address && ownSet.add(x.address)));
    setOwnAddresses(ownSet);
    setInteg(i.data);
    setSubTypes((s.data as SubType[]) || []);
    const addrs = (sh.data?.addresses && sh.data.addresses.length ? sh.data.addresses : (sh.data?.address ? [sh.data.address] : []));
    setAddresses(addrs);
    const tcMap: Record<string, any> = {}; (tc.data || []).forEach((r: any) => { tcMap[r.address] = r; }); setTerminalsCfg(tcMap);
    const mmMap: Record<string, any> = {}; (mm.data || []).forEach((r: any) => { mmMap[r.subscription_type_id] = r; }); setMenuMap(mmMap);
    setOrderLog((ol.data as OrderLog[]) || []);
    setLoading(false);
  }, [shopId, address]);

  useEffect(() => { if (shopId) load(); }, [shopId, load]);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('iiko-connect', { body: { action, shopId, address, ...extra } });
    if (error) {
      // supabase-js прячет тело за общим сообщением — достаём реальную ошибку iiko.
      let msg = error.message;
      try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleConnect = async () => {
    if (showLegacy) {
      if (!apiLogin.trim()) { toast.error('Введите apiLogin'); return; }
    } else if (!apiKey.trim()) { toast.error('Введите apiKey'); return; }
    setBusy('connect');
    try {
      const payload = showLegacy ? { apiLogin: apiLogin.trim() } : { apiKey: apiKey.trim() };
      const d = await call('connect', payload);
      setOrgs(d.organizations || []);
      toast.success('Ключ подключён. Выберите организацию.');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const saveInteg = async (patch: Record<string, unknown>, label?: string) => {
    const { error } = await supabase.from('iiko_integrations').update({ ...patch, updated_at: new Date().toISOString() }).eq('shop_id', shopId!).eq('address', address);
    if (error) { toast.error('Не сохранилось: ' + error.message); return false; }
    setInteg((p: any) => ({ ...p, ...patch }));
    if (label) toast.success(label);
    return true;
  };

  const selectOrg = async (org: Org) => {
    await saveInteg({ organization_id: org.id, organization_name: org.name }, 'Организация выбрана');
  };

  const loadTerminals = async () => {
    setBusy('terminals');
    try { const d = await call('terminals'); setTerminals(d.terminals || []); setOrderTypes(d.orderTypes || []); setLoaded(f => ({ ...f, terminals: true })); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const loadPayTypes = async () => {
    setBusy('pay');
    try { const d = await call('payment_types'); setPayTypes(d.paymentTypes || []); setLoaded(f => ({ ...f, pay: true })); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const loadProducts = async () => {
    setBusy('products');
    try { const d = await call('products'); setProducts(d.products || []); setLoaded(f => ({ ...f, products: true })); toast.success(`Загружено позиций: ${d.products?.length || 0}`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const saveTerminal = async (address: string, patch: Record<string, unknown>) => {
    const cur = terminalsCfg[address] || {};
    const row = { shop_id: shopId, address, terminal_group_id: cur.terminal_group_id || '', order_type_id: cur.order_type_id || null, ...cur, ...patch };
    if (!row.terminal_group_id) { setTerminalsCfg(p => ({ ...p, [address]: row })); return; }
    const { error } = await supabase.from('iiko_terminals').upsert(row, { onConflict: 'shop_id,address' });
    if (error) { toast.error(error.message); return; }
    setTerminalsCfg(p => ({ ...p, [address]: row }));
  };

  const setTerminalField = (address: string, field: string, value: string) => {
    if (field === 'terminal_group_id') {
      const t = terminals.find(x => x.id === value);
      saveTerminal(address, { terminal_group_id: value, terminal_group_name: t?.name || null });
    } else {
      const o = orderTypes.find(x => x.id === value);
      saveTerminal(address, { order_type_id: value || null, order_type_name: o?.name || null });
    }
  };

  const savePayment = async (id: string) => {
    const pt = payTypes.find(p => p.id === id);
    if (pt) await saveInteg({ payment_type_id: pt.id, payment_type_name: pt.name, payment_type_kind: pt.paymentTypeKind }, 'Способ оплаты выбран');
  };

  const pickProduct = async (subTypeId: string, product: Product) => {
    const row = { shop_id: shopId, address, subscription_type_id: subTypeId, iiko_product_id: product.id, iiko_product_name: product.name, iiko_price: product.price };
    const { error } = await supabase.from('iiko_menu_map').upsert(row, { onConflict: 'shop_id,address,subscription_type_id' });
    if (error) { toast.error(error.message); return; }
    setMenuMap(p => ({ ...p, [subTypeId]: row }));
    setPickerFor(null); setProductSearch('');
    toast.success(`${product.name} привязан`);
  };

  const toggleActive = async (v: boolean) => {
    if (v) {
      // минимальная валидация перед включением
      if (!integ?.organization_id || !integ?.payment_type_id) { toast.error('Выберите организацию и способ оплаты'); return; }
      if (Object.keys(terminalsCfg).length === 0) { toast.error('Настройте хотя бы одну кассу'); return; }
      if (Object.keys(menuMap).length === 0) { toast.error('Привяжите хотя бы один тариф'); return; }
      // 1 активная интеграция на АДРЕС — гасим Poster и Rosta этого же адреса.
      await supabase.from('poster_integrations').update({ is_active: false }).eq('shop_id', shopId!).eq('address', address);
      await supabase.from('rosta_integrations').update({ is_active: false }).eq('shop_id', shopId!).eq('address', address);
    }
    await saveInteg({ is_active: v }, v ? 'Интеграция включена (Poster и Rosta этого адреса выключены)' : 'Интеграция выключена');
  };

  const disconnect = async () => {
    if (!confirm('Отключить интеграцию iiko? Настройки касс и привязки тарифов будут удалены.')) return;
    setBusy('disconnect');
    try {
      await supabase.from('iiko_menu_map').delete().eq('shop_id', shopId!).eq('address', address);
      await supabase.from('iiko_integrations').delete().eq('shop_id', shopId!).eq('address', address);
      toast.success('Интеграция отключена');
      setInteg(null); setTerminalsCfg({}); setMenuMap({}); setOrgs([]); setApiLogin('');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const runTestOrder = async () => {
    if (!testSubType) { toast.error('Выберите тариф для теста'); return; }
    setBusy('test');
    try {
      const { data, error } = await supabase.functions.invoke('iiko-connect', { body: { action: 'test_order', shopId, address, subscriptionTypeId: testSubType, testAddress: testAddress || undefined } });
      if (error) { let msg = error.message; try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ } throw new Error(msg); }
      if (data?.ok) toast.success('Тестовый заказ отправлен ✓ Проверьте кассу iiko (отменить можно ниже, в «Заказы iiko»)'); else toast.error(data?.error || 'Ошибка тестового заказа');
      await load(); // подтянуть тестовый заказ в «Заказы iiko» с кнопкой отмены
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const orderAction = async (logId: string, action: 'retry' | 'cancel') => {
    setBusy(action + logId);
    try {
      const { data, error } = await supabase.functions.invoke('iiko-order', { body: { action, logId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(action === 'retry' ? (data.status === 'created' ? 'Заказ создан' : `Статус: ${data.status}`) : (data.note || 'Заказ отменён'));
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (authLoading || loading) {
    return <PartnerLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div></PartnerLayout>;
  }
  if (!isPartner) {
    return <PartnerLayout><div className="p-6 text-center text-muted-foreground">Раздел доступен только владельцу кофейни.</div></PartnerLayout>;
  }

  const connected = !!integ;
  const orgChosen = !!integ?.organization_id;
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  // Адреса, которыми управляет ТЕКУЩАЯ интеграция: конкретный адрес → только он;
  // дефолт ('') → адреса без своей интеграции.
  const terminalAddresses = address === '' ? addresses.filter(a => !ownAddresses.has(a)) : [address];

  return (
    <PartnerLayout>
      <div className="max-w-2xl mx-auto px-4 space-y-5 pb-10">
        <div className="flex items-center gap-2 pt-2">
          <Plug className="text-primary" size={22} />
          <h2 className="text-xl font-bold text-foreground">Интеграция POS</h2>
        </div>

        {/* Настройка для адреса — у разных адресов может быть своя интеграция */}
        {addresses.length > 1 && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Настройка для адреса</label>
            <select className={selectCls} value={address} onChange={e => setAddress(e.target.value)}>
              <option value="">По умолчанию (все адреса)</option>
              {addresses.map(a => <option key={a} value={a}>{a}{ownAddresses.has(a) ? ' — своя интеграция' : ''}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">«По умолчанию» действует на адреса без своей интеграции. Выберите конкретный адрес, чтобы задать ему отдельного провайдера/ключ (напр. второй адрес на другом аккаунте).</p>
          </div>
        )}

        {/* Выбор провайдера — активна одна интеграция на адрес */}
        <div className="grid grid-cols-3 gap-2">
          {(['iiko', 'poster', 'rosta'] as const).map(pv => (
            <button
              key={pv}
              onClick={() => setProvider(pv)}
              className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${provider === pv ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border hover:bg-secondary/70'}`}
            >
              {pv === 'iiko' ? 'iiko' : pv === 'poster' ? 'Poster' : 'Rosta'}
            </button>
          ))}
        </div>

        {provider === 'poster' && shopId && <PartnerPosterSection shopId={shopId} address={address} />}
        {provider === 'rosta' && shopId && <PartnerRostaSection shopId={shopId} address={address} />}

        {provider === 'iiko' && (<>
        {/* Статус интеграции — реальные живые проверки, авто-обновление 5 мин */}
        {shopId && <IntegrationStatus shopId={shopId} address={address} provider="iiko" />}
        {/* 1. Подключение */}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span> Подключение</h3>
          {!connected ? (
            <>
              {!showLegacy ? (
                <>
                  <p className="text-sm text-muted-foreground">Введите apiKey — из iikoWeb: «Интеграции → API-ключи».</p>
                  <div className="flex gap-2">
                    <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="apiKey" />
                    <Button onClick={handleConnect} disabled={busy === 'connect'}>{busy === 'connect' ? <Loader2 className="animate-spin" size={16} /> : 'Подключить'}</Button>
                  </div>
                  <button className="text-xs text-muted-foreground" onClick={() => setShowLegacy(true)}>У меня старый ключ (apiLogin, iiko Transport)</button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Старый формат: apiLogin (iiko Transport).</p>
                  <div className="flex gap-2">
                    <Input value={apiLogin} onChange={e => setApiLogin(e.target.value)} placeholder="apiLogin" />
                    <Button onClick={handleConnect} disabled={busy === 'connect'}>{busy === 'connect' ? <Loader2 className="animate-spin" size={16} /> : 'Подключить'}</Button>
                  </div>
                  <button className="text-xs text-primary" onClick={() => setShowLegacy(false)}>← Новый ключ (apiKey)</button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="text-sm text-foreground flex items-center gap-2"><CheckCircle2 size={16} className="text-accent" /> Ключ подключён</div>
              {/* Организация */}
              {(orgs.length > 0 || !orgChosen) && (
                <div>
                  <label className="text-xs text-muted-foreground">Организация</label>
                  <div className="flex gap-2 mt-1">
                    <select className={selectCls} value={integ?.organization_id || ''} onChange={e => { const o = orgs.find(x => x.id === e.target.value); if (o) selectOrg(o); }}>
                      <option value="">— выберите —</option>
                      {integ?.organization_id && !orgs.some(o => o.id === integ.organization_id) && (
                        <option value={integ.organization_id}>{integ.organization_name}</option>
                      )}
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {orgs.length === 0 && <Button variant="outline" onClick={async () => { setBusy('orgs'); try { const d = await call('organizations'); setOrgs(d.organizations || []); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); } }} disabled={busy === 'orgs'}>{busy === 'orgs' ? <Loader2 className="animate-spin" size={16} /> : 'Список'}</Button>}
                  </div>
                  {orgChosen && <p className="text-xs text-accent mt-1">Выбрана: {integ.organization_name}</p>}
                </div>
              )}
            </>
          )}
        </section>

        {connected && orgChosen && (
          <>
            {/* 2. Способ оплаты */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><CreditCard size={16} className="text-primary" /> Способ оплаты</h3>
              <div className="flex gap-2">
                <select className={selectCls} value={integ?.payment_type_id || ''} onChange={e => savePayment(e.target.value)}>
                  <option value="">— выберите —</option>
                  {integ?.payment_type_id && !payTypes.some(p => p.id === integ.payment_type_id) && (
                    <option value={integ.payment_type_id}>{integ.payment_type_name}</option>
                  )}
                  {payTypes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button variant="outline" onClick={loadPayTypes} disabled={busy === 'pay'}>{busy === 'pay' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить'}</Button>
              </div>
              {loaded.pay && payTypes.length <= 1 && (
                <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">
                  iiko отдаёт для API только «{payTypes[0]?.name || 'Наличные'}». Если нужен «безнал subday» — в iiko (iikoOffice/iikoWeb) этот тип оплаты нужно <b>сделать доступным для внешних систем (API)</b>. Это настройка на стороне iiko.
                </p>
              )}
            </section>

            {/* 3. Кассы по адресам */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2"><MapPin size={16} className="text-primary" /> Кассы по адресам</h3>
                <Button variant="outline" size="sm" onClick={loadTerminals} disabled={busy === 'terminals'}>{busy === 'terminals' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить кассы'}</Button>
              </div>
              {terminalAddresses.length === 0 && <p className="text-sm text-muted-foreground">Для этой интеграции нет адресов без своей настройки.</p>}
              {loaded.terminals && terminals.length < terminalAddresses.length && (
                <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">
                  iiko вернул касс: {terminals.length}, а адресов у этой интеграции: {terminalAddresses.length}. Касса не видна через API — проверьте в iiko, что терминал адреса зарегистрирован и относится к этой же организации, либо что apiKey даёт доступ к точке.
                </p>
              )}
              {terminalAddresses.map(addr => (
                <div key={addr} className="rounded-xl bg-secondary/40 p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1"><MapPin size={13} className="text-primary shrink-0" /> {addr}</p>
                  <div className="grid grid-cols-1 gap-2">
                    <select className={selectCls} value={terminalsCfg[addr]?.terminal_group_id || ''} onChange={e => setTerminalField(addr, 'terminal_group_id', e.target.value)}>
                      <option value="">— касса (терминал) —</option>
                      {terminalsCfg[addr]?.terminal_group_id && !terminals.some(t => t.id === terminalsCfg[addr].terminal_group_id) && (
                        <option value={terminalsCfg[addr].terminal_group_id}>{terminalsCfg[addr].terminal_group_name}</option>
                      )}
                      {terminals.map(t => <option key={t.id} value={t.id}>{t.name}{t.address ? ` · ${t.address}` : ''}</option>)}
                    </select>
                    <select className={selectCls} value={terminalsCfg[addr]?.order_type_id || ''} onChange={e => setTerminalField(addr, 'order_type_id', e.target.value)}>
                      <option value="">— тип заказа «на вынос» —</option>
                      {terminalsCfg[addr]?.order_type_id && !orderTypes.some(o => o.id === terminalsCfg[addr].order_type_id) && (
                        <option value={terminalsCfg[addr].order_type_id}>{terminalsCfg[addr].order_type_name}</option>
                      )}
                      {orderTypes
                        // Модель «Самовывоз/вынос» → ТОЛЬКО тип самовывоза (DeliveryPickUp).
                        // Курьерскую доставку (DeliveryByCourier) не показываем: она требует адрес
                        // клиента, которого мы не передаём, и заказ падает. Модель «на кассу» → Common.
                        .filter(o => (integ?.order_endpoint || 'order') === 'delivery' ? o.orderServiceType === 'DeliveryPickUp' : o.orderServiceType === 'Common')
                        .map(o => <option key={o.id} value={o.id}>{o.name} ({o.orderServiceType})</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </section>

            {/* 4. Автозакрытие */}
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">Автозакрытие чека</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Вкл — заказ сам закрывается на выбранный способ. Выкл — падает открытым с уже привязанной оплатой, кассир дозакрывает.</p>
                </div>
                <Switch checked={!!integ?.auto_close} onCheckedChange={v => saveInteg({ auto_close: v }, v ? 'Автозакрытие включено' : 'Автозакрытие выключено')} />
              </div>
            </section>

            {/* 4b. Модель заказа (пилот) + тест */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Модель заказа</h3>
              <div>
                <label className="text-xs text-muted-foreground">Способ создания заказа</label>
                <select className={selectCls + ' mt-1'} value={integ?.order_endpoint || 'order'} onChange={e => saveInteg({ order_endpoint: e.target.value }, 'Сохранено')}>
                  <option value="order">Заказ на кассу (order/create)</option>
                  <option value="delivery">Самовывоз/вынос (deliveries/create)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">Для выноса — «Самовывоз/вынос». Тогда в кассе выбирайте тип заказа <b>«Доставка самовывоз»</b> (тип «Обычный» для доставки iiko не примет).</p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground">Чек фискализируется извне</p>
                  <p className="text-xs text-muted-foreground">Включай, только если этого требует касса (пилот).</p>
                </div>
                <Switch checked={!!integ?.fiscalize_externally} onCheckedChange={v => saveInteg({ fiscalize_externally: v })} />
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-sm font-medium text-foreground">Тестовый заказ</p>
                <p className="text-xs text-muted-foreground">Отправит реальный заказ на кассу (без списания) — проверить, что позиция падает и закрывается.</p>
                <select className={selectCls} value={testSubType} onChange={e => setTestSubType(e.target.value)}>
                  <option value="">— тариф —</option>
                  {subTypes.filter(st => menuMap[st.id]).map(st => <option key={st.id} value={st.id}>{st.name} → {menuMap[st.id]?.iiko_product_name}</option>)}
                </select>
                {terminalAddresses.length > 1 && (
                  <select className={selectCls} value={testAddress} onChange={e => setTestAddress(e.target.value)}>
                    <option value="">— адрес (касса) —</option>
                    {terminalAddresses.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                )}
                <Button variant="outline" onClick={runTestOrder} disabled={busy === 'test'} className="w-full">
                  {busy === 'test' ? <Loader2 className="animate-spin" size={16} /> : 'Отправить тестовый заказ'}
                </Button>
              </div>
            </section>

            {/* 5. Привязка тарифов */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2"><ListChecks size={16} className="text-primary" /> Тарифы → позиции меню</h3>
                <Button variant="outline" size="sm" onClick={loadProducts} disabled={busy === 'products'}>{busy === 'products' ? <Loader2 className="animate-spin" size={16} /> : 'Загрузить меню'}</Button>
              </div>
              {loaded.products && products.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">
                  Меню в iiko Cloud для этой организации пустое (0 позиций). Это настройка на стороне iiko: номенклатуру нужно <b>выгрузить/синхронизировать в облако</b>, либо apiKey выдан для организации без меню. Проверьте в iikoOffice, что меню опубликовано, и что ключ от нужной кофейни.
                </p>
              )}
              {subTypes.map(st => {
                const m = menuMap[st.id];
                return (
                  <div key={st.id} className="rounded-xl bg-secondary/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{st.name} <span className="text-xs text-muted-foreground">({st.type})</span></p>
                        {m ? <p className="text-xs text-accent truncate">→ {m.iiko_product_name}{m.iiko_price != null ? ` · ${m.iiko_price}₸` : ''}</p> : <p className="text-xs text-muted-foreground">не привязан</p>}
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
                              {p.price != null && <span className="text-xs text-muted-foreground shrink-0">{p.price}₸</span>}
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

            {/* 6. Включение + отключение */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Интеграция активна</h3>
                  <p className="text-xs text-muted-foreground">Заказы падают в кассу только когда включено.</p>
                </div>
                <Switch checked={!!integ?.is_active} onCheckedChange={toggleActive} />
              </div>
              <Button variant="outline" onClick={disconnect} disabled={busy === 'disconnect'} className="w-full text-destructive border-destructive/40 hover:bg-destructive/10">
                {busy === 'disconnect' ? <Loader2 className="animate-spin" size={16} /> : <><Trash2 size={15} className="mr-2" /> Отключить интеграцию</>}
              </Button>
            </section>

            {/* 7. История заказов iiko */}
            {orderLog.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <h3 className="font-semibold text-foreground">Заказы iiko</h3>
                {orderLog.map(o => (
                  <div key={o.id} className="flex items-center gap-2 text-sm border-b border-border/50 py-2 last:border-0">
                    <StatusDot status={o.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">
                        {o.is_test && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1">тест</span>}
                        {o.iiko_product_name || '—'} <span className="text-xs text-muted-foreground">· {o.address || '—'}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString('ru')}{o.error ? ` · ${o.error}` : ''}</p>
                    </div>
                    {o.status === 'failed' && !o.is_test && <Button size="sm" variant="ghost" onClick={() => orderAction(o.id, 'retry')} disabled={busy === 'retry' + o.id} title="Повторить"><RefreshCw size={15} /></Button>}
                    {(o.status === 'created' || o.status === 'closed') && <Button size="sm" variant="ghost" onClick={() => orderAction(o.id, 'cancel')} disabled={busy === 'cancel' + o.id} title="Отменить"><XCircle size={15} /></Button>}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        </>)}
      </div>
    </PartnerLayout>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = { created: 'bg-accent', closed: 'bg-accent', pending: 'bg-amber-500', failed: 'bg-destructive', cancelled: 'bg-muted-foreground', duplicate: 'bg-muted-foreground' };
  const label: Record<string, string> = { created: 'создан', closed: 'закрыт', pending: 'ожидание', failed: 'ошибка', cancelled: 'отменён', duplicate: 'дубль' };
  return <span className="flex items-center gap-1 shrink-0"><span className={`w-2 h-2 rounded-full ${map[status] || 'bg-muted'}`} /><span className="text-[11px] text-muted-foreground w-14">{label[status] || status}</span></span>;
}
