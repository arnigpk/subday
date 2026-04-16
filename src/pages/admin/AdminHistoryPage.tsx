import { useEffect, useState } from 'react';
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
import { Search, ChevronLeft, ChevronRight, User, CalendarIcon, Trash2, ShoppingBag } from 'lucide-react';
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
  user_name: string | null;
  user_phone: string | null;
  user_public_id: string | null;
  user_country: string | null;
  preorder_status?: string;
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

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchData();
  }, [page, shopFilter, typeFilter, countryFilter, cityFilter, search, periodType, dateRange]);

  const fetchShops = async () => {
    const { data } = await supabase.from('shops').select('name').eq('is_active', true);
    if (data) setShops(data.map(s => s.name));
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
      const { data: allSubTypes } = await supabase.from('subscription_types').select('id, name');
      const subTypeById = new Map<string, string>();
      allSubTypes?.forEach(st => subTypeById.set(st.id, st.name));

      let combined: HistoryRow[] = [];

      rData.forEach((r: any) => {
        combined.push({
          id: r.id,
          source: 'redemption',
          user_id: r.user_id,
          shop_name: r.shop_name,
          shop_address: r.shop_address || null,
          drink_name: r.drink_name,
          drink_type: r.drink_type,
          redeemed_at: r.redeemed_at,
          subscription_name: r.subscription_name || (() => {
            const typeId = userSubTypeId.get(r.user_id);
            return typeId ? subTypeById.get(typeId) || null : null;
          })(),
          user_name: profileMap.get(r.user_id)?.name || null,
          user_phone: profileMap.get(r.user_id)?.phone || null,
          user_public_id: profileMap.get(r.user_id)?.public_id || null,
          user_country: profileMap.get(r.user_id)?.country || null,
        });
      });

      pData.forEach((p: any) => {
        const drinkDesc = p.syrup ? `${p.coffee_name} + ${p.syrup}` : p.coffee_name;
        const typeId = userSubTypeId.get(p.user_id);
        const subName = typeId ? subTypeById.get(typeId) || null : null;
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

      // Paginate
      const start = page * PAGE_SIZE;
      setRows(combined.slice(start, start + PAGE_SIZE));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
            <div className="flex items-center justify-between">
              <CardTitle>Всего записей ({totalCount})</CardTitle>
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
          {isLoading ? (
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
