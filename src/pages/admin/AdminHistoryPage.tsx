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
import { Search, ChevronLeft, ChevronRight, User, CalendarIcon, Trash2 } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import { toast } from '@/components/ui/sonner';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface RedemptionWithUser {
  id: string;
  user_id: string;
  shop_name: string;
  drink_name: string;
  drink_type: string;
  redeemed_at: string;
  subscription_name: string | null;
  user_name: string | null;
  user_phone: string | null;
  user_public_id: string | null;
  user_country: string | null;
}

type PeriodType = 'last_month' | 'custom' | 'all';

const PAGE_SIZE = 20;

export default function AdminHistoryPage() {
  const { canManage } = useAdminAuth();
  const [redemptions, setRedemptions] = useState<RedemptionWithUser[]>([]);
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
    fetchRedemptions();
  }, [page, shopFilter, typeFilter, countryFilter, cityFilter, search, periodType, dateRange]);

  const fetchShops = async () => {
    const { data } = await supabase
      .from('shops')
      .select('name')
      .eq('is_active', true);
    if (data) {
      setShops(data.map(s => s.name));
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

  const fetchRedemptions = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('redemptions')
        .select('*', { count: 'exact' });

      if (shopFilter !== 'all') query = query.eq('shop_name', shopFilter);
      if (typeFilter !== 'all') query = query.eq('drink_type', typeFilter);

      const dateFilters = getDateFilters();
      if (dateFilters) {
        query = query.gte('redeemed_at', dateFilters.from.toISOString());
        query = query.lte('redeemed_at', dateFilters.to.toISOString());
      }

      const { data: redemptionsData, count, error } = await query
        .order('redeemed_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setTotalCount(count || 0);

      if (!redemptionsData || redemptionsData.length === 0) {
        setRedemptions([]);
        setIsLoading(false);
        return;
      }

      const userIds = [...new Set(redemptionsData.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, phone, public_id, country, city')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      let combined: RedemptionWithUser[] = redemptionsData.map(r => ({
        ...r,
        user_name: profileMap.get(r.user_id)?.name || null,
        user_phone: profileMap.get(r.user_id)?.phone || null,
        user_public_id: profileMap.get(r.user_id)?.public_id || null,
        user_country: profileMap.get(r.user_id)?.country || null,
      }));

      // Filter by country/city (client-side since it's from profiles)
      if (countryFilter !== 'all') {
        combined = combined.filter(r => r.user_country === countryFilter);
      }
      if (cityFilter !== 'all') {
        combined = combined.filter(r => {
          const profile = profileMap.get(r.user_id);
          return (profile as any)?.city === cityFilter;
        });
      }

      if (search) {
        const searchLower = search.toLowerCase();
        combined = combined.filter(r =>
          r.user_name?.toLowerCase().includes(searchLower) ||
          r.user_phone?.includes(search) ||
          r.drink_name.toLowerCase().includes(searchLower) ||
          r.shop_name.toLowerCase().includes(searchLower)
        );
      }

      setRedemptions(combined);
    } catch (error) {
      console.error('Error fetching redemptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    setPage(0);
    if (value !== 'custom') setDateRange(undefined);
  };

  const handleClearRedemptions = async () => {
    try {
      const dateFilters = getDateFilters();
      let query = supabase.from('redemptions').delete();
      if (dateFilters) {
        query = query.gte('redeemed_at', dateFilters.from.toISOString()).lte('redeemed_at', dateFilters.to.toISOString());
      } else {
        query = query.gt('redeemed_at', '1970-01-01');
      }
      const { error } = await query;
      if (error) throw error;
      toast.success('История списаний очищена');
      fetchRedemptions();
    } catch (error) {
      console.error('Error clearing redemptions:', error);
      toast.error('Ошибка очистки');
    }
  };

  const handleDeleteRedemption = async (id: string) => {
    try {
      const { error } = await supabase.from('redemptions').delete().eq('id', id);
      if (error) throw error;
      toast.success('Запись удалена');
      fetchRedemptions();
    } catch (error) {
      console.error('Error deleting redemption:', error);
      toast.error('Ошибка удаления');
    }
  };

  const formatPeriodLabel = () => {
    if (periodType === 'last_month') {
      return format(subMonths(new Date(), 1), 'LLLL yyyy', { locale: ru });
    }
    if (periodType === 'custom' && dateRange?.from) {
      if (dateRange.to) return `${format(dateRange.from, 'd MMM', { locale: ru })} - ${format(dateRange.to, 'd MMM yyyy', { locale: ru })}`;
      return format(dateRange.from, 'd MMMM yyyy', { locale: ru });
    }
    return 'Все время';
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout title="История">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Всего покупок ({totalCount})</CardTitle>
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
                      <AlertDialogTitle>Очистить историю списаний?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {periodType !== 'all'
                          ? `Будут удалены списания за период: ${formatPeriodLabel()}`
                          : 'Будут удалены ВСЕ списания'
                        }. Это действие нельзя отменить. История исчезнет у пользователей и в кабинете партнера.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearRedemptions}>Очистить</AlertDialogAction>
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
          ) : redemptions.length === 0 ? (
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
                      <TableHead className="w-10">{canManage ? '' : ''}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{r.user_name || 'Без имени'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.user_public_id || '—'}</TableCell>
                        <TableCell>{r.user_phone?.startsWith('+telegram_') ? 'TG' : (r.user_phone || '—')}</TableCell>
                        <TableCell>{r.shop_name}</TableCell>
                        <TableCell>{r.drink_name}</TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{r.subscription_name || '—'}</span></TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            r.drink_type === 'coffee' 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' 
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          }`}>
                            {r.drink_type === 'coffee' ? 'Кофе' : 'Ланч'}
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
                                    Запись будет удалена безвозвратно у пользователя и в кабинете партнера.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteRedemption(r.id)}>Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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