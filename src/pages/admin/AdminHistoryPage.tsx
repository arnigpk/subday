import React, { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { Search, ChevronLeft, ChevronRight, User, CalendarIcon, Trash2, ShoppingBag, Download, Loader2 } from 'lucide-react';
import { downloadCSV, formatDateRu } from '@/utils/exportCSV';
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import { toast } from '@/components/ui/sonner';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface HistoryRow {
  id: string;
  source: 'redemption' | 'preorder';
  user_id: string;
  shop_name: string;
  shop_address: string | null;
  drink_name: string;
  drink_type: string;
  redeemed_at: string;
  subscription_name: string | null;
  subscription_price: number | null;
  subscription_cups: number | null;
  // Снимок % выплаты на момент списания (заморозка старых выплат). null у старых списаний.
  payoutPercent?: number | null;
  user_name: string | null;
  user_phone: string | null;
  user_public_id: string | null;
  user_country: string | null;
  preorder_status?: string;
}

function calcPayout(
  row: HistoryRow,
  shopPercentMap: Map<string, number>,
  subTypePercentMap: Map<string, number | null>,
): number {
  // Completed (issued) preorders pay the partner exactly like a normal redemption
  // of one cup. Pending/expired preorders (and anything else) do not.
  if (row.source === 'preorder') {
    if (row.preorder_status !== 'completed') return 0;
  } else if (row.source !== 'redemption') {
    return 0;
  }
  // Выдача гостевого доступа другу ("Гостевой доступ → ...") — не реальная продажа в кофейне,
  // фактический напиток считается отдельной записью при сканировании ("Гостевой кофе от ID...").
  // Без этого исключения сумма гостевого кофе задваивалась бы (выдача + погашение).
  if (row.drink_name.startsWith('Гостевой доступ')) return 0;
  if (!row.subscription_price || !row.subscription_cups || row.subscription_cups === 0) return 0;
  return Math.round(row.subscription_price / row.subscription_cups * (resolvePayoutPercent(row, shopPercentMap, subTypePercentMap) / 100));
}

// Процент выплаты для строки: снимок на момент списания → процент тарифа →
// процент кофейни → 70. Единая точка — используется и в истории, и в расчётах.
function resolvePayoutPercent(
  row: HistoryRow,
  shopPercentMap: Map<string, number>,
  subTypePercentMap: Map<string, number | null>,
): number {
  return (row.payoutPercent != null)
    ? row.payoutPercent
    : ((row.subscription_name ? subTypePercentMap.get(row.subscription_name) : undefined)
        ?? shopPercentMap.get(row.shop_name) ?? 70);
}

type PeriodType = 'last_month' | 'custom' | 'all';

const PAGE_SIZE = 20;

export default function AdminHistoryPage() {
  const { canManage } = useAdminAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [periodType, setPeriodType] = useState<PeriodType>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [shops, setShops] = useState<string[]>([]);
  const [shopPercentMap, setShopPercentMap] = useState<Map<string, number>>(new Map());
  const [subTypePercentMap, setSubTypePercentMap] = useState<Map<string, number | null>>(new Map());
  const [isExporting, setIsExporting] = useState(false);
  const [totalPayout, setTotalPayout] = useState(0);

  // --- Вкладка «Расчёты / выплаты» ---
  const [activeTab, setActiveTab] = useState<'history' | 'payouts'>('history');
  const [payoutStats, setPayoutStats] = useState<Array<{
    shop: string; cups: number; total: number; payout: number; ours: number;
    tariffs: Array<{ name: string; percent: number; cups: number; total: number; payout: number; ours: number }>;
  }>>([]);
  const [isLoadingPayouts, setIsLoadingPayouts] = useState(false);
  // Раскрытые кофейни во вкладке расчётов (по умолчанию все свёрнуты)
  const [expandedShops, setExpandedShops] = useState<Set<string>>(new Set());
  const toggleShopExpand = (shop: string) => {
    setExpandedShops(prev => {
      const next = new Set(prev);
      if (next.has(shop)) next.delete(shop); else next.add(shop);
      return next;
    });
  };

  // --- Отметки выплат (2 периода в месяц: H1 = 1–15, H2 = 16–конец) ---
  const _now = new Date();
  const [payoutPeriod, setPayoutPeriod] = useState<{ year: number; month: number }>({ year: _now.getFullYear(), month: _now.getMonth() + 1 });
  const [shopIdMap, setShopIdMap] = useState<Map<string, string>>(new Map());
  // ключ: `${shopId}|${half}` → отметка сделана
  const [payoutMarks, setPayoutMarks] = useState<Map<string, { paid_at: string }>>(new Map());

  const reloadPayoutMarks = async (year: number, month: number) => {
    const { data } = await supabase.from('partner_payouts').select('shop_id, half, paid_at').eq('year', year).eq('month', month);
    const m = new Map<string, { paid_at: string }>();
    (data || []).forEach((r: any) => m.set(`${r.shop_id}|${r.half}`, { paid_at: r.paid_at }));
    setPayoutMarks(m);
  };

  useEffect(() => {
    if (activeTab === 'payouts') reloadPayoutMarks(payoutPeriod.year, payoutPeriod.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, payoutPeriod.year, payoutPeriod.month]);

  const shiftPayoutMonth = (delta: number) => {
    setPayoutPeriod(prev => {
      const d = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  const togglePayoutMark = async (shopId: string, half: 1 | 2, amount: number | null) => {
    if (!shopId) return;
    const key = `${shopId}|${half}`;
    const exists = payoutMarks.has(key);
    setPayoutMarks(prev => {
      const next = new Map(prev);
      if (exists) next.delete(key); else next.set(key, { paid_at: new Date().toISOString() });
      return next;
    });
    try {
      if (exists) {
        await supabase.from('partner_payouts').delete()
          .eq('shop_id', shopId).eq('year', payoutPeriod.year).eq('month', payoutPeriod.month).eq('half', half);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('partner_payouts').insert({
          shop_id: shopId, year: payoutPeriod.year, month: payoutPeriod.month, half, amount, marked_by: user?.id ?? null,
        });
      }
    } catch (e) {
      console.error('payout toggle error', e);
      toast.error('Ошибка отметки выплаты');
      reloadPayoutMarks(payoutPeriod.year, payoutPeriod.month);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchData();
  }, [page, shopFilter, typeFilter, countryFilter, cityFilter, search, periodType, dateRange, shopPercentMap]);

  const fetchShops = async () => {
    const { data } = await supabase.from('shops').select('id, name, is_active, revenue_share_percent');
    if (data) {
      setShops(data.filter(s => s.is_active).map(s => s.name));
      setShopPercentMap(new Map(data.map(s => [s.name, s.revenue_share_percent ?? 70])));
      setShopIdMap(new Map(data.map((s: any) => [s.name, s.id])));
    }
  };

  const getDateFilters = () => {
    const now = new Date();
    if (periodType === 'last_month') {
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    if (periodType === 'custom' && dateRange?.from) {
      return { from: startOfDay(dateRange.from), to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from) };
    }
    return null;
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const dateFilters = getDateFilters();

      // Fetch redemptions
      let rQuery = supabase.from('redemptions').select('*', { count: 'exact' });
      if (shopFilter !== 'all') rQuery = rQuery.eq('shop_name', shopFilter);
      if (typeFilter !== 'all' && typeFilter !== 'preorder') rQuery = rQuery.eq('drink_type', typeFilter);
      if (dateFilters) {
        rQuery = rQuery.gte('redeemed_at', dateFilters.from.toISOString()).lte('redeemed_at', dateFilters.to.toISOString());
      }

      // Fetch preorders
      let pQuery = supabase.from('preorders').select('*', { count: 'exact' });
      if (shopFilter !== 'all') pQuery = pQuery.eq('shop_name', shopFilter);
      if (dateFilters) {
        pQuery = pQuery.gte('created_at', dateFilters.from.toISOString()).lte('created_at', dateFilters.to.toISOString());
      }

      // If filtering by type, skip one or the other
      const skipRedemptions = typeFilter === 'preorder';
      const skipPreorders = typeFilter === 'coffee' || typeFilter === 'drinks';

      const [rResult, pResult] = await Promise.all([
        skipRedemptions ? Promise.resolve({ data: [], count: 0, error: null }) : rQuery.order('redeemed_at', { ascending: false }).limit(500),
        skipPreorders ? Promise.resolve({ data: [], count: 0, error: null }) : pQuery.order('created_at', { ascending: false }).limit(500),
      ]);

      const rData = rResult.data || [];
      const pData = pResult.data || [];

      // Collect user IDs
      const userIds = new Set<string>();
      rData.forEach((r: any) => userIds.add(r.user_id));
      pData.forEach((p: any) => userIds.add(p.user_id));

      let profileMap = new Map<string, any>();
      // Map user_id -> subscription_type_id (most recent)
      let userSubTypeId = new Map<string, string>();

      if (userIds.size > 0) {
        const uids = Array.from(userIds);
        const [{ data: profiles }, { data: userSubs }] = await Promise.all([
          supabase.from('profiles').select('user_id, name, phone, public_id, country, city').in('user_id', uids),
          supabase.from('user_subscriptions')
            .select('user_id, subscription_type_id, created_at')
            .in('user_id', uids)
            .not('subscription_type_id', 'is', null)
            .order('created_at', { ascending: false }),
        ]);
        profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        userSubs?.forEach(us => {
          if (!userSubTypeId.has(us.user_id) && us.subscription_type_id) {
            userSubTypeId.set(us.user_id, us.subscription_type_id);
          }
        });
      }

      // Fetch all subscription types for name lookup
      const { data: allSubTypes } = await supabase.from('subscription_types').select('id, name, price, cups_count, revenue_share_percent');
      const subTypeById = new Map<string, { name: string; price: number; cups: number; percent: number | null }>();
      const subTypeByName = new Map<string, { price: number; cups: number }>();
      const newSubTypePercentMap = new Map<string, number | null>();
      allSubTypes?.forEach(st => {
        subTypeById.set(st.id, { name: st.name, price: st.price, cups: st.cups_count, percent: (st as any).revenue_share_percent ?? null });
        subTypeByName.set(st.name, { price: st.price, cups: st.cups_count });
        newSubTypePercentMap.set(st.name, (st as any).revenue_share_percent ?? null);
      });
      setSubTypePercentMap(newSubTypePercentMap);

      let combined: HistoryRow[] = [];

      rData.forEach((r: any) => {
        const userTypeId = userSubTypeId.get(r.user_id);
        const userType = userTypeId ? subTypeById.get(userTypeId) : null;
        const subName = r.subscription_name || userType?.name || null;
        const typeInfo = subName ? subTypeByName.get(subName) : null;
        // Привязка к конкретному тарифу по его id (архивированному) — приоритетнее имени.
        const byId = r.subscription_type_id ? subTypeById.get(r.subscription_type_id) : null;
        combined.push({
          id: r.id,
          source: 'redemption',
          user_id: r.user_id,
          shop_name: r.shop_name,
          shop_address: r.shop_address || null,
          drink_name: r.drink_name,
          drink_type: r.drink_type,
          redeemed_at: r.redeemed_at,
          subscription_name: subName,
          // Приоритет: снимок → по id тарифа → по имени → по текущей подписке юзера.
          subscription_price: r.payout_price ?? byId?.price ?? typeInfo?.price ?? userType?.price ?? null,
          subscription_cups: r.payout_cups ?? byId?.cups ?? typeInfo?.cups ?? userType?.cups ?? null,
          payoutPercent: r.payout_percent ?? byId?.percent ?? null,
          user_name: profileMap.get(r.user_id)?.name || null,
          user_phone: profileMap.get(r.user_id)?.phone || null,
          user_public_id: profileMap.get(r.user_id)?.public_id || null,
          user_country: profileMap.get(r.user_id)?.country || null,
        });
      });

      pData.forEach((p: any) => {
        const drinkDesc = p.syrup ? `${p.coffee_name} + ${p.syrup}` : p.coffee_name;
        const typeId = userSubTypeId.get(p.user_id);
        const fallbackType = typeId ? subTypeById.get(typeId) || null : null;
        const subName = p.subscription_name || fallbackType?.name || null;
        const typeInfo = subName ? subTypeByName.get(subName) : null;
        combined.push({
          id: p.id,
          source: 'preorder',
          user_id: p.user_id,
          shop_name: p.shop_name,
          shop_address: p.shop_address || null,
          drink_name: drinkDesc,
          drink_type: 'preorder',
          redeemed_at: p.created_at,
          subscription_name: subName,
          subscription_price: typeInfo?.price ?? fallbackType?.price ?? null,
          subscription_cups: typeInfo?.cups ?? fallbackType?.cups ?? null,
          user_name: profileMap.get(p.user_id)?.name || null,
          user_phone: profileMap.get(p.user_id)?.phone || null,
          user_public_id: profileMap.get(p.user_id)?.public_id || null,
          user_country: profileMap.get(p.user_id)?.country || null,
          preorder_status: p.status,
        });
      });

      // Filter by country/city
      if (countryFilter !== 'all') combined = combined.filter(r => r.user_country === countryFilter);
      if (cityFilter !== 'all') {
        combined = combined.filter(r => {
          const profile = profileMap.get(r.user_id);
          return profile?.city === cityFilter;
        });
      }

      // Search
      if (search) {
        const searchLower = search.toLowerCase();
        combined = combined.filter(r =>
          r.user_name?.toLowerCase().includes(searchLower) ||
          r.user_phone?.includes(search) ||
          r.drink_name.toLowerCase().includes(searchLower) ||
          r.shop_name.toLowerCase().includes(searchLower)
        );
      }

      // Sort by date descending
      combined.sort((a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime());

      setTotalCount(combined.length);
      setTotalPayout(combined.reduce((sum, r) => sum + calcPayout(r, shopPercentMap, newSubTypePercentMap), 0));

      // Paginate
      const start = page * PAGE_SIZE;
      setRows(combined.slice(start, start + PAGE_SIZE));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportAll = async () => {
    setIsExporting(true);
    try {
      const dateFilters = getDateFilters();
      const skipR = typeFilter === 'preorder';
      const skipP = typeFilter === 'coffee' || typeFilter === 'drinks';

      let rQ = supabase.from('redemptions').select('*');
      if (shopFilter !== 'all') rQ = rQ.eq('shop_name', shopFilter);
      if (typeFilter !== 'all' && !skipR) rQ = rQ.eq('drink_type', typeFilter);
      if (dateFilters) rQ = rQ.gte('redeemed_at', dateFilters.from.toISOString()).lte('redeemed_at', dateFilters.to.toISOString());

      let pQ = supabase.from('preorders').select('*');
      if (shopFilter !== 'all') pQ = pQ.eq('shop_name', shopFilter);
      if (dateFilters) pQ = pQ.gte('created_at', dateFilters.from.toISOString()).lte('created_at', dateFilters.to.toISOString());

      const [{ data: rData = [] }, { data: pData = [] }, { data: exportSubTypes }] = await Promise.all([
        skipR ? Promise.resolve({ data: [] }) : rQ.order('redeemed_at', { ascending: false }).limit(5000),
        skipP ? Promise.resolve({ data: [] }) : pQ.order('created_at', { ascending: false }).limit(5000),
        supabase.from('subscription_types').select('id, name, price, cups_count, revenue_share_percent'),
      ]);

      const expSubById = new Map<string, { name: string; price: number; cups: number; percent: number | null }>();
      const expSubByName = new Map<string, { price: number; cups: number }>();
      const expSubTypePercentMap = new Map<string, number | null>();
      exportSubTypes?.forEach((st: any) => {
        expSubById.set(st.id, { name: st.name, price: st.price, cups: st.cups_count, percent: st.revenue_share_percent ?? null });
        expSubByName.set(st.name, { price: st.price, cups: st.cups_count });
        expSubTypePercentMap.set(st.name, st.revenue_share_percent ?? null);
      });

      const allData = [...(rData || []), ...(pData || [])];
      const userIds = [...new Set(allData.map((r: any) => r.user_id))];
      let profileMap = new Map<string, any>();
      let expUserSubTypeId = new Map<string, string>();
      if (userIds.length > 0) {
        const [{ data: profiles }, { data: userSubs }] = await Promise.all([
          supabase.from('profiles').select('user_id, name, phone, public_id, country, city').in('user_id', userIds),
          supabase.from('user_subscriptions').select('user_id, subscription_type_id, created_at')
            .in('user_id', userIds).not('subscription_type_id', 'is', null).order('created_at', { ascending: false }),
        ]);
        profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        userSubs?.forEach((us: any) => {
          if (!expUserSubTypeId.has(us.user_id) && us.subscription_type_id) expUserSubTypeId.set(us.user_id, us.subscription_type_id);
        });
      }

      let combined: HistoryRow[] = [
        ...(rData || []).map((r: any) => {
          const userTypeId = expUserSubTypeId.get(r.user_id);
          const userType = userTypeId ? expSubById.get(userTypeId) : null;
          const subName = r.subscription_name || userType?.name || null;
          const typeInfo = subName ? expSubByName.get(subName) : null;
          const byId = r.subscription_type_id ? expSubById.get(r.subscription_type_id) : null;
          return {
            id: r.id, source: 'redemption' as const, user_id: r.user_id,
            shop_name: r.shop_name, shop_address: r.shop_address || null,
            drink_name: r.drink_name, drink_type: r.drink_type, redeemed_at: r.redeemed_at,
            subscription_name: subName,
            subscription_price: r.payout_price ?? byId?.price ?? typeInfo?.price ?? userType?.price ?? null,
            subscription_cups: r.payout_cups ?? byId?.cups ?? typeInfo?.cups ?? userType?.cups ?? null,
            payoutPercent: r.payout_percent ?? byId?.percent ?? null,
            user_name: profileMap.get(r.user_id)?.name || null,
            user_phone: profileMap.get(r.user_id)?.phone || null,
            user_public_id: profileMap.get(r.user_id)?.public_id || null,
            user_country: profileMap.get(r.user_id)?.country || null,
          };
        }),
        ...(pData || []).map((p: any) => {
          const typeId = expUserSubTypeId.get(p.user_id);
          const fallbackType = typeId ? expSubById.get(typeId) || null : null;
          const subName = p.subscription_name || fallbackType?.name || null;
          const typeInfo = subName ? expSubByName.get(subName) : null;
          return {
            id: p.id, source: 'preorder' as const, user_id: p.user_id,
            shop_name: p.shop_name, shop_address: p.shop_address || null,
            drink_name: p.syrup ? `${p.coffee_name} + ${p.syrup}` : p.coffee_name,
            drink_type: 'preorder', redeemed_at: p.created_at,
            subscription_name: subName,
            subscription_price: typeInfo?.price ?? fallbackType?.price ?? null,
            subscription_cups: typeInfo?.cups ?? fallbackType?.cups ?? null,
            user_name: profileMap.get(p.user_id)?.name || null,
            user_phone: profileMap.get(p.user_id)?.phone || null,
            user_public_id: profileMap.get(p.user_id)?.public_id || null,
            user_country: profileMap.get(p.user_id)?.country || null,
            preorder_status: p.status,
          };
        }),
      ];

      if (countryFilter !== 'all') combined = combined.filter(r => r.user_country === countryFilter);
      if (search) {
        const sl = search.toLowerCase();
        combined = combined.filter(r => r.user_name?.toLowerCase().includes(sl) || r.user_phone?.includes(search) || r.shop_name.toLowerCase().includes(sl));
      }
      combined.sort((a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime());

      downloadCSV(`история_${new Date().toISOString().slice(0,10)}.csv`,
        ['Дата', 'Тип', 'Клиент', 'ID', 'Телефон', 'Страна', 'Кофейня', 'Адрес', 'Напиток', 'Подписка', 'Выплата партнёру (₸)', 'Статус'],
        combined.map(r => [
          formatDateRu(r.redeemed_at),
          r.source === 'preorder' ? 'Предзаказ' : 'Списание',
          r.user_name || '', r.user_public_id || '', r.user_phone || '', r.user_country || '',
          r.shop_name, r.shop_address || '', r.drink_name, r.subscription_name || '',
          calcPayout(r, shopPercentMap, expSubTypePercentMap) || '',
          r.preorder_status || '',
        ])
      );
    } finally { setIsExporting(false); }
  };

  // Агрегированные расчёты по кофейням: общая сумма (полная цена чашки по тарифу),
  // выплата партнёру (та же calcPayout, что и в истории — 70/80% тарифа или кофейни,
  // со снимком на момент списания) и наша доля (= общая − выплата).
  const fetchPayouts = async () => {
    setIsLoadingPayouts(true);
    try {
      const dateFilters = getDateFilters();
      const skipR = typeFilter === 'preorder';
      const skipP = typeFilter === 'coffee' || typeFilter === 'drinks';

      let rQ = supabase.from('redemptions').select('*');
      if (shopFilter !== 'all') rQ = rQ.eq('shop_name', shopFilter);
      if (typeFilter !== 'all' && !skipR) rQ = rQ.eq('drink_type', typeFilter);
      if (dateFilters) rQ = rQ.gte('redeemed_at', dateFilters.from.toISOString()).lte('redeemed_at', dateFilters.to.toISOString());

      let pQ = supabase.from('preorders').select('*');
      if (shopFilter !== 'all') pQ = pQ.eq('shop_name', shopFilter);
      if (dateFilters) pQ = pQ.gte('created_at', dateFilters.from.toISOString()).lte('created_at', dateFilters.to.toISOString());

      const [{ data: rData = [] }, { data: pData = [] }, { data: pSubTypes }] = await Promise.all([
        skipR ? Promise.resolve({ data: [] }) : rQ.order('redeemed_at', { ascending: false }).limit(5000),
        skipP ? Promise.resolve({ data: [] }) : pQ.order('created_at', { ascending: false }).limit(5000),
        supabase.from('subscription_types').select('id, name, price, cups_count, revenue_share_percent'),
      ]);

      const pSubById = new Map<string, { name: string; price: number; cups: number; percent: number | null }>();
      const pSubByName = new Map<string, { price: number; cups: number }>();
      const pSubTypePercentMap = new Map<string, number | null>();
      pSubTypes?.forEach((st: any) => {
        pSubById.set(st.id, { name: st.name, price: st.price, cups: st.cups_count, percent: st.revenue_share_percent ?? null });
        pSubByName.set(st.name, { price: st.price, cups: st.cups_count });
        pSubTypePercentMap.set(st.name, st.revenue_share_percent ?? null);
      });

      const allData = [...(rData || []), ...(pData || [])];
      const userIds = [...new Set(allData.map((r: any) => r.user_id))];
      const profileMap = new Map<string, any>();
      const pUserSubTypeId = new Map<string, string>();
      // Чанками, чтобы .in() не превышал лимит URL
      for (let i = 0; i < userIds.length; i += 100) {
        const chunk = userIds.slice(i, i + 100);
        const [{ data: profiles }, { data: userSubs }] = await Promise.all([
          supabase.from('profiles').select('user_id, country, city').in('user_id', chunk),
          supabase.from('user_subscriptions').select('user_id, subscription_type_id, created_at')
            .in('user_id', chunk).not('subscription_type_id', 'is', null).order('created_at', { ascending: false }),
        ]);
        profiles?.forEach((p: any) => profileMap.set(p.user_id, p));
        userSubs?.forEach((us: any) => {
          if (!pUserSubTypeId.has(us.user_id) && us.subscription_type_id) pUserSubTypeId.set(us.user_id, us.subscription_type_id);
        });
      }

      // Собираем строки в формате HistoryRow (та же логика, что и в exportAll)
      let combined: HistoryRow[] = [
        ...(rData || []).map((r: any) => {
          const userTypeId = pUserSubTypeId.get(r.user_id);
          const userType = userTypeId ? pSubById.get(userTypeId) : null;
          const subName = r.subscription_name || userType?.name || null;
          const typeInfo = subName ? pSubByName.get(subName) : null;
          const byId = r.subscription_type_id ? pSubById.get(r.subscription_type_id) : null;
          return {
            id: r.id, source: 'redemption' as const, user_id: r.user_id,
            shop_name: r.shop_name, shop_address: null, drink_name: r.drink_name,
            drink_type: r.drink_type, redeemed_at: r.redeemed_at,
            subscription_name: subName,
            subscription_price: r.payout_price ?? byId?.price ?? typeInfo?.price ?? userType?.price ?? null,
            subscription_cups: r.payout_cups ?? byId?.cups ?? typeInfo?.cups ?? userType?.cups ?? null,
            payoutPercent: r.payout_percent ?? byId?.percent ?? null,
            user_name: null, user_phone: null, user_public_id: null,
            user_country: profileMap.get(r.user_id)?.country || null,
          } as HistoryRow & { user_city?: string | null };
        }),
        ...(pData || []).map((p: any) => {
          const typeId = pUserSubTypeId.get(p.user_id);
          const fallbackType = typeId ? pSubById.get(typeId) || null : null;
          const subName = p.subscription_name || fallbackType?.name || null;
          const typeInfo = subName ? pSubByName.get(subName) : null;
          return {
            id: p.id, source: 'preorder' as const, user_id: p.user_id,
            shop_name: p.shop_name, shop_address: null,
            drink_name: p.coffee_name, drink_type: 'preorder', redeemed_at: p.created_at,
            subscription_name: subName,
            subscription_price: typeInfo?.price ?? fallbackType?.price ?? null,
            subscription_cups: typeInfo?.cups ?? fallbackType?.cups ?? null,
            user_name: null, user_phone: null, user_public_id: null,
            user_country: profileMap.get(p.user_id)?.country || null,
            preorder_status: p.status,
          } as HistoryRow;
        }),
      ];

      // Фильтры страны/города (как в истории)
      if (countryFilter !== 'all') combined = combined.filter(r => r.user_country === countryFilter);
      if (cityFilter !== 'all') combined = combined.filter(r => profileMap.get(r.user_id)?.city === cityFilter);

      // Агрегация: кофейня → тарифы внутри неё. У каждого тарифа свой точный
      // процент (70 или 80) — никаких «смешанных» процентов. Строка кофейни —
      // сумма её тарифов.
      type TariffAgg = { name: string; percent: number; cups: number; total: number; payout: number; ours: number };
      const byShop = new Map<string, Map<string, TariffAgg>>();
      for (const row of combined) {
        const payout = calcPayout(row, shopPercentMap, pSubTypePercentMap);
        if (payout <= 0) continue; // не участвует (гостевая выдача, невыданный предзаказ и т.д.)
        const percent = resolvePayoutPercent(row, shopPercentMap, pSubTypePercentMap);
        const fullCup = Math.round((row.subscription_price as number) / (row.subscription_cups as number));
        const tariffName = row.subscription_name || 'Без тарифа';
        const tariffKey = `${tariffName}|${percent}`;

        if (!byShop.has(row.shop_name)) byShop.set(row.shop_name, new Map());
        const tariffs = byShop.get(row.shop_name)!;
        const agg = tariffs.get(tariffKey) || { name: tariffName, percent, cups: 0, total: 0, payout: 0, ours: 0 };
        agg.cups += 1;
        agg.total += fullCup;
        agg.payout += payout;
        agg.ours += fullCup - payout;
        tariffs.set(tariffKey, agg);
      }

      const statsArr = [...byShop.entries()]
        .map(([shop, tariffMap]) => {
          const tariffs = [...tariffMap.values()].sort((a, b) => a.name.localeCompare(b.name) || a.percent - b.percent);
          return {
            shop,
            cups: tariffs.reduce((a, t) => a + t.cups, 0),
            total: tariffs.reduce((a, t) => a + t.total, 0),
            payout: tariffs.reduce((a, t) => a + t.payout, 0),
            ours: tariffs.reduce((a, t) => a + t.ours, 0),
            tariffs,
          };
        })
        .sort((a, b) => b.payout - a.payout);
      setPayoutStats(statsArr);
    } catch (e) {
      console.error('fetchPayouts error:', e);
      setPayoutStats([]);
    } finally {
      setIsLoadingPayouts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'payouts') fetchPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, shopFilter, typeFilter, countryFilter, cityFilter, periodType, dateRange, shopPercentMap]);

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    setPage(0);
    if (value !== 'custom') setDateRange(undefined);
  };

  const handleClearHistory = async () => {
    try {
      const dateFilters = getDateFilters();

      // Delete redemptions
      let rQuery = supabase.from('redemptions').delete();
      if (dateFilters) {
        rQuery = rQuery.gte('redeemed_at', dateFilters.from.toISOString()).lte('redeemed_at', dateFilters.to.toISOString());
      } else {
        rQuery = rQuery.gt('redeemed_at', '1970-01-01');
      }

      // Delete preorders
      let pQuery = supabase.from('preorders').delete();
      if (dateFilters) {
        pQuery = pQuery.gte('created_at', dateFilters.from.toISOString()).lte('created_at', dateFilters.to.toISOString());
      } else {
        pQuery = pQuery.gt('created_at', '1970-01-01');
      }

      const [rResult, pResult] = await Promise.all([rQuery, pQuery]);
      if (rResult.error) throw rResult.error;
      if (pResult.error) throw pResult.error;

      toast.success('История полностью очищена');
      fetchData();
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error('Ошибка очистки');
    }
  };

  const handleDeleteRow = async (row: HistoryRow) => {
    try {
      if (row.source === 'redemption') {
        const { error } = await supabase.from('redemptions').delete().eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('preorders').delete().eq('id', row.id);
        if (error) throw error;
      }
      toast.success('Запись удалена');
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Ошибка удаления');
    }
  };

  const formatPeriodLabel = () => {
    if (periodType === 'last_month') return format(subMonths(new Date(), 1), 'LLLL yyyy', { locale: ru });
    if (periodType === 'custom' && dateRange?.from) {
      if (dateRange.to) return `${format(dateRange.from, 'd MMM', { locale: ru })} - ${format(dateRange.to, 'd MMM yyyy', { locale: ru })}`;
      return format(dateRange.from, 'd MMMM yyyy', { locale: ru });
    }
    return 'Все время';
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getTypeBadge = (row: HistoryRow) => {
    if (row.source === 'preorder') {
      const status = row.preorder_status;
      if (status === 'completed') return { text: 'Предзаказ ✓', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' };
      if (status === 'expired') return { text: 'Закрыт', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
      return { text: 'Предзаказ', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
    }
    if (row.drink_type === 'coffee') return { text: 'Кофе', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
    return { text: 'Ланч', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' };
  };

  return (
    <AdminLayout title="История">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            {/* Вкладки: История / Расчёты и выплаты */}
            <div className="flex w-full sm:w-auto rounded-lg border border-border overflow-hidden self-start">
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 sm:flex-none px-5 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                История
              </button>
              <button
                onClick={() => setActiveTab('payouts')}
                className={`flex-1 sm:flex-none px-5 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'payouts' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                Расчёты / выплаты
              </button>
            </div>
            {activeTab === 'history' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Всего записей ({totalCount})</CardTitle>
                {totalPayout > 0 && (
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                    К выплате партнёрам: {totalPayout.toLocaleString('ru-RU')} ₸
                  </span>
                )}
                <Button variant="outline" size="sm" disabled={isExporting} onClick={exportAll}>
                  {isExporting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Download size={14} className="mr-1" />}
                  {isExporting ? 'Загрузка...' : 'Скачать отчёт (CSV)'}
                </Button>
              </div>
              {canManage && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Очистить историю
                    </Button>
                  </AlertDialogTrigger>
                   <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Очистить всю историю?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {periodType !== 'all'
                          ? `Будут удалены все списания и предзаказы за период: ${formatPeriodLabel()}`
                          : 'Будут удалены ВСЕ списания и предзаказы'
                        }. История очистится у всех пользователей. Это действие нельзя отменить.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearHistory}>Очистить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            )}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по имени, телефону, напитку..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    className="pl-10"
                  />
                </div>
                <CountryCityFilter
                  countryFilter={countryFilter}
                  cityFilter={cityFilter}
                  onCountryChange={(v) => { setCountryFilter(v); setPage(0); }}
                  onCityChange={(v) => { setCityFilter(v); setPage(0); }}
                />
                <Select value={shopFilter} onValueChange={(v) => { setShopFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Кофейня" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все кофейни</SelectItem>
                    {shops.map(shop => (
                      <SelectItem key={shop} value={shop}>{shop}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    <SelectItem value="coffee">Кофе</SelectItem>
                    <SelectItem value="drinks">Ланч</SelectItem>
                    <SelectItem value="preorder">Предзаказы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <Select value={periodType} onValueChange={(v) => handlePeriodChange(v as PeriodType)}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Период" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все время</SelectItem>
                    <SelectItem value="last_month">Последний месяц</SelectItem>
                    <SelectItem value="custom">Выбрать период</SelectItem>
                  </SelectContent>
                </Select>
                
                {periodType === 'custom' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>{format(dateRange.from, 'd MMM', { locale: ru })} - {format(dateRange.to, 'd MMM yyyy', { locale: ru })}</>
                          ) : format(dateRange.from, 'd MMMM yyyy', { locale: ru })
                        ) : 'Выберите даты'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={(range) => { setDateRange(range); setPage(0); }}
                        numberOfMonths={1}
                        locale={ru}
                      />
                    </PopoverContent>
                  </Popover>
                )}
                
                {periodType !== 'all' && (
                  <span className="text-sm text-muted-foreground">Период: {formatPeriodLabel()}</span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === 'payouts' ? (
            isLoadingPayouts ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : payoutStats.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет расчётов за выбранный период</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Отметки выплат за:</span>
                    <div className="flex items-center gap-1 rounded-lg border border-border">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftPayoutMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
                      <span className="text-sm font-semibold min-w-[120px] text-center capitalize">
                        {format(new Date(payoutPeriod.year, payoutPeriod.month - 1, 1), 'LLLL yyyy', { locale: ru })}
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftPayoutMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    const totalCups = payoutStats.reduce((a, s) => a + s.cups, 0);
                    const totalSum = payoutStats.reduce((a, s) => a + s.total, 0);
                    const totalPay = payoutStats.reduce((a, s) => a + s.payout, 0);
                    const totalOurs = payoutStats.reduce((a, s) => a + s.ours, 0);
                    downloadCSV(`расчеты_выплаты_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Кофейня', 'Тариф', 'Процент выплаты', 'Чашек', 'Общая сумма (₸)', 'Выплата партнёру (₸)', 'Наш процент (₸)'],
                      [
                        ...payoutStats.flatMap(s => [
                          [s.shop, 'ИТОГО ПО КОФЕЙНЕ', '', s.cups, s.total, s.payout, s.ours],
                          ...s.tariffs.map(t => [s.shop, t.name, `${t.percent}%`, t.cups, t.total, t.payout, t.ours]),
                        ]),
                        ['ИТОГО', '', '', totalCups, totalSum, totalPay, totalOurs],
                      ]
                    );
                  }}>
                    <Download size={14} className="mr-1" />
                    Скачать отчёт (CSV)
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Кофейня / тариф</TableHead>
                      <TableHead className="text-right">Чашек</TableHead>
                      <TableHead className="text-right">Общая сумма</TableHead>
                      <TableHead className="text-right">Выплата партнёру</TableHead>
                      <TableHead className="text-right">Наш процент</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payoutStats.map((s) => (
                      <React.Fragment key={s.shop}>
                        {/* Строка кофейни — итоги; клик раскрывает разбивку по тарифам */}
                        <TableRow
                          className="bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors select-none"
                          onClick={() => toggleShopExpand(s.shop)}
                        >
                          <TableCell className="font-bold">
                            <div className="flex items-center">
                              <span className={`inline-block mr-2 text-xs transition-transform ${expandedShops.has(s.shop) ? 'rotate-90' : ''}`}>▶</span>
                              {s.shop}
                            </div>
                            {(() => {
                              const shopId = shopIdMap.get(s.shop);
                              const m1 = !!shopId && payoutMarks.has(`${shopId}|1`);
                              const m2 = !!shopId && payoutMarks.has(`${shopId}|2`);
                              const chip = (active: boolean) =>
                                `text-[11px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                                  active
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                                    : 'bg-muted text-muted-foreground border-transparent hover:bg-muted/70'
                                }`;
                              return (
                                <div className="flex gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" title="Период 1–15 (выплата 16–17)" className={chip(m1)} onClick={() => togglePayoutMark(shopId!, 1, null)}>
                                    {m1 ? '✓ ' : ''}1–15
                                  </button>
                                  <button type="button" title="Период 16–конец (выплата 1–2)" className={chip(m2)} onClick={() => togglePayoutMark(shopId!, 2, null)}>
                                    {m2 ? '✓ ' : ''}16–конец
                                  </button>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right font-bold">{s.cups.toLocaleString('ru-RU')}</TableCell>
                          <TableCell className="text-right font-bold">{s.total.toLocaleString('ru-RU')} ₸</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">{s.payout.toLocaleString('ru-RU')} ₸</TableCell>
                          <TableCell className="text-right font-bold text-primary">{s.ours.toLocaleString('ru-RU')} ₸</TableCell>
                        </TableRow>
                        {/* Тарифы внутри кофейни — видны только когда кофейня раскрыта */}
                        {expandedShops.has(s.shop) && s.tariffs.map((t) => (
                          <TableRow key={`${s.shop}|${t.name}|${t.percent}`}>
                            <TableCell className="pl-8 text-sm text-muted-foreground">
                              {t.name}
                              <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                t.percent === 80 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' : 'bg-muted text-muted-foreground'
                              }`}>{t.percent}%</span>
                            </TableCell>
                            <TableCell className="text-right text-sm">{t.cups.toLocaleString('ru-RU')}</TableCell>
                            <TableCell className="text-right text-sm">{t.total.toLocaleString('ru-RU')} ₸</TableCell>
                            <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">
                              {t.payout.toLocaleString('ru-RU')} ₸
                              <span className="ml-1 text-xs text-muted-foreground">({t.percent}%)</span>
                            </TableCell>
                            <TableCell className="text-right text-sm text-primary">
                              {t.ours.toLocaleString('ru-RU')} ₸
                              <span className="ml-1 text-xs text-muted-foreground">({100 - t.percent}%)</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                    {/* Итоговая строка */}
                    <TableRow className="border-t-2 bg-muted/40">
                      <TableCell className="font-bold">ИТОГО</TableCell>
                      <TableCell className="text-right font-bold">
                        {payoutStats.reduce((a, s) => a + s.cups, 0).toLocaleString('ru-RU')}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {payoutStats.reduce((a, s) => a + s.total, 0).toLocaleString('ru-RU')} ₸
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {payoutStats.reduce((a, s) => a + s.payout, 0).toLocaleString('ru-RU')} ₸
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        {payoutStats.reduce((a, s) => a + s.ours, 0).toLocaleString('ru-RU')} ₸
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-3">
                  Общая сумма — полная стоимость каждой выданной чашки по тарифу (цена тарифа ÷ чашек).
                  Выплата — по проценту тарифа (70/80%) или кофейни, зафиксированному на момент списания.
                  Наш процент = общая сумма − выплата партнёру.
                </p>
              </div>
            )
          ) : isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Нет данных за выбранный период</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Кофейня</TableHead>
                      <TableHead>Напиток</TableHead>
                      <TableHead>Подписка</TableHead>
                      <TableHead>Выплата партнёру</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const badge = getTypeBadge(r);
                      return (
                        <TableRow key={`${r.source}-${r.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {r.source === 'preorder' ? <ShoppingBag className="w-4 h-4 text-amber-600" /> : <User className="w-4 h-4 text-muted-foreground" />}
                              <span className="font-medium">{r.user_name || 'Без имени'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{r.user_public_id || '—'}</TableCell>
                          <TableCell>{r.user_phone?.startsWith('+telegram_') ? 'TG' : (r.user_phone || '—')}</TableCell>
                          <TableCell>
                            <div>
                              <span>{r.shop_name}</span>
                              {r.shop_address && <p className="text-xs text-muted-foreground">{r.shop_address}</p>}
                            </div>
                          </TableCell>
                          <TableCell>{r.drink_name}</TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{r.subscription_name || '—'}</span></TableCell>
                          <TableCell>
                            {calcPayout(r, shopPercentMap, subTypePercentMap) > 0 ? (
                              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                {calcPayout(r, shopPercentMap, subTypePercentMap).toLocaleString('ru-RU')} ₸
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${badge.className}`}>
                              {badge.text}
                            </span>
                          </TableCell>
                          <TableCell>
                            {new Date(r.redeemed_at).toLocaleString('ru-RU', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell>
                            {canManage && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Запись будет удалена безвозвратно.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteRow(r)}>Удалить</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Страница {page + 1} из {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
