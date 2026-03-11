import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { CalendarIcon, ChevronLeft, ChevronRight, Trash2, User, CreditCard, Shield, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { toast } from '@/components/ui/sonner';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';

interface TransactionWithUser {
  id: string;
  user_id: string;
  subscription_name: string;
  transaction_type: string;
  created_at: string;
  amount: number | null;
  payment_method: string | null;
  is_special_offer: boolean | null;
  payment_order_id: string | null;
  user_name: string | null;
  user_phone: string | null;
  user_public_id: string | null;
  user_country: string | null;
  payment_id: string | null;
  order_id: string | null;
}

interface PaymentOrderWithUser {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  payment_id: string | null;
  payment_url: string | null;
  subscription_type_id: string;
  metadata: any;
  user_name: string | null;
  user_phone: string | null;
  user_public_id: string | null;
  user_country: string | null;
  subscription_name: string | null;
}

type PeriodType = 'last_month' | 'custom' | 'all';
type PaymentStatusFilter = 'all' | 'paid' | 'pending' | 'failed';
const PAGE_SIZE = 20;

export default function AdminSubscriptionTransactionsPage() {
  const [activeTab, setActiveTab] = useState('payments');
  
  // Transactions state
  const [transactions, setTransactions] = useState<TransactionWithUser[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txPage, setTxPage] = useState(0);
  const [txTotal, setTxTotal] = useState(0);

  // Payment orders state
  const [payments, setPayments] = useState<PaymentOrderWithUser[]>([]);
  const [pmLoading, setPmLoading] = useState(true);
  const [pmPage, setPmPage] = useState(0);
  const [pmTotal, setPmTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>('all');

  // Shared filters
  const [periodType, setPeriodType] = useState<PeriodType>('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (activeTab === 'payments') fetchPayments();
    else fetchTransactions();
  }, [activeTab, pmPage, txPage, periodType, dateRange, countryFilter, cityFilter, statusFilter]);

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

  const fetchPayments = async () => {
    setPmLoading(true);
    try {
      let query = supabase.from('payment_orders').select('*', { count: 'exact' });

      const dateFilters = getDateFilters();
      if (dateFilters) {
        query = query.gte('created_at', dateFilters.from.toISOString());
        query = query.lte('created_at', dateFilters.to.toISOString());
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(pmPage * PAGE_SIZE, (pmPage + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setPmTotal(count || 0);

      if (!data || data.length === 0) {
        setPayments([]);
        setPmLoading(false);
        return;
      }

      const userIds = [...new Set(data.map(t => t.user_id))];
      const subTypeIds = [...new Set(data.map(t => t.subscription_type_id))];

      const [profilesResult, subTypesResult] = await Promise.all([
        supabase.from('profiles').select('user_id, name, phone, public_id, country, city').in('user_id', userIds),
        supabase.from('subscription_types').select('id, name').in('id', subTypeIds),
      ]);

      const profileMap = new Map(profilesResult.data?.map(p => [p.user_id, p]) || []);
      const subTypeMap = new Map(subTypesResult.data?.map(s => [s.id, s]) || []);

      let combined: PaymentOrderWithUser[] = data.map(t => {
        const profile = profileMap.get(t.user_id);
        const subType = subTypeMap.get(t.subscription_type_id);
        return {
          ...t,
          metadata: t.metadata,
          user_name: profile?.name || null,
          user_phone: profile?.phone || null,
          user_public_id: profile?.public_id || null,
          user_country: profile?.country || null,
          subscription_name: subType?.name || (t.metadata as any)?.subscription_name || null,
        };
      });

      if (countryFilter !== 'all') {
        combined = combined.filter(t => t.user_country === countryFilter);
      }
      if (cityFilter !== 'all') {
        combined = combined.filter(t => {
          const profile = profileMap.get(t.user_id);
          return (profile as any)?.city === cityFilter;
        });
      }

      setPayments(combined);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setPmLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setTxLoading(true);
    try {
      let query = supabase.from('subscription_transactions').select('*', { count: 'exact' });

      const dateFilters = getDateFilters();
      if (dateFilters) {
        query = query.gte('created_at', dateFilters.from.toISOString());
        query = query.lte('created_at', dateFilters.to.toISOString());
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(txPage * PAGE_SIZE, (txPage + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setTxTotal(count || 0);

      if (!data || data.length === 0) {
        setTransactions([]);
        setTxLoading(false);
        return;
      }

      const userIds = [...new Set(data.map(t => t.user_id))];
      const paymentOrderIds = data.map(t => t.payment_order_id).filter(Boolean) as string[];

      const [profilesResult, paymentOrdersResult] = await Promise.all([
        supabase.from('profiles').select('user_id, name, phone, public_id, country, city').in('user_id', userIds),
        paymentOrderIds.length > 0
          ? supabase.from('payment_orders').select('id, payment_id, order_id').in('id', paymentOrderIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map(profilesResult.data?.map(p => [p.user_id, p]) || []);
      const paymentMap = new Map((paymentOrdersResult as any).data?.map((p: any) => [p.id, p]) || []);

      let combined: TransactionWithUser[] = data.map(t => {
        const profile = profileMap.get(t.user_id);
        const payment = t.payment_order_id ? paymentMap.get(t.payment_order_id) as any : null;
        return {
          ...t,
          user_name: profile?.name || null,
          user_phone: profile?.phone || null,
          user_public_id: profile?.public_id || null,
          user_country: profile?.country || null,
          payment_id: payment?.payment_id || null,
          order_id: payment?.order_id || null,
        };
      });

      if (countryFilter !== 'all') {
        combined = combined.filter(t => t.user_country === countryFilter);
      }
      if (cityFilter !== 'all') {
        combined = combined.filter(t => {
          const profile = profileMap.get(t.user_id);
          return (profile as any)?.city === cityFilter;
        });
      }

      setTransactions(combined);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setTxLoading(false);
    }
  };

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    setPmPage(0);
    setTxPage(0);
    if (value !== 'custom') setDateRange(undefined);
  };

  const handleClearHistory = async () => {
    try {
      const dateFilters = getDateFilters();
      let query = supabase.from('subscription_transactions').delete();
      if (dateFilters) {
        query = query.gte('created_at', dateFilters.from.toISOString()).lte('created_at', dateFilters.to.toISOString());
      } else {
        query = query.gt('created_at', '1970-01-01');
      }
      const { error } = await query;
      if (error) throw error;
      toast.success('История транзакций очищена');
      fetchTransactions();
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error('Ошибка очистки');
    }
  };

  const handleClearPayments = async () => {
    try {
      const dateFilters = getDateFilters();
      let query = supabase.from('payment_orders').delete();
      if (dateFilters) {
        query = query.gte('created_at', dateFilters.from.toISOString()).lte('created_at', dateFilters.to.toISOString());
      } else {
        query = query.gt('created_at', '1970-01-01');
      }
      const { error } = await query;
      if (error) throw error;
      toast.success('История оплат очищена');
      fetchPayments();
    } catch (error) {
      console.error('Error clearing payments:', error);
      toast.error('Ошибка очистки');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      const { error } = await supabase.from('subscription_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.success('Транзакция удалена');
      fetchTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleDeletePayment = async (id: string) => {
    try {
      const { error } = await supabase.from('payment_orders').delete().eq('id', id);
      if (error) throw error;
      toast.success('Запись оплаты удалена');
      fetchPayments();
    } catch (error) {
      console.error('Error deleting payment:', error);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="w-3 h-3" /> Оплачено
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircle className="w-3 h-3" /> Ошибка
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <Clock className="w-3 h-3" /> Ожидание
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{status}</span>;
    }
  };

  const pmTotalPages = Math.ceil(pmTotal / PAGE_SIZE);
  const txTotalPages = Math.ceil(txTotal / PAGE_SIZE);

  const FiltersRow = () => (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <CountryCityFilter
        countryFilter={countryFilter}
        cityFilter={cityFilter}
        onCountryChange={(v) => { setCountryFilter(v); setPmPage(0); setTxPage(0); }}
        onCityChange={(v) => { setCityFilter(v); setPmPage(0); setTxPage(0); }}
      />

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

      {activeTab === 'payments' && (
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as PaymentStatusFilter); setPmPage(0); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="paid">✅ Оплаченные</SelectItem>
            <SelectItem value="pending">⏳ Ожидающие</SelectItem>
            <SelectItem value="failed">❌ Неоплаченные</SelectItem>
          </SelectContent>
        </Select>
      )}

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
            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange}
              onSelect={(range) => { setDateRange(range); setPmPage(0); setTxPage(0); }} numberOfMonths={1} locale={ru} />
          </PopoverContent>
        </Popover>
      )}

      {periodType !== 'all' && (
        <span className="text-sm text-muted-foreground">Период: {formatPeriodLabel()}</span>
      )}
    </div>
  );

  const renderLoading = () => (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 bg-muted animate-pulse rounded" />
      ))}
    </div>
  );

  const Pagination = ({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (fn: (p: number) => number) => void }) => (
    totalPages > 1 ? (
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
    ) : null
  );

  return (
    <AdminLayout title="Транзакции подписок">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>
                {activeTab === 'payments' ? `Все переходы на оплату (${pmTotal})` : `Успешные транзакции (${txTotal})`}
              </CardTitle>
              {activeTab === 'transactions' ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Очистить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Очистить историю транзакций?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {periodType !== 'all'
                          ? `Будут удалены транзакции за период: ${formatPeriodLabel()}`
                          : 'Будут удалены ВСЕ транзакции'
                        }. Это действие нельзя отменить. Транзакции исчезнут и у пользователей.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearHistory}>Очистить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Очистить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Очистить историю оплат?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {periodType !== 'all'
                          ? `Будут удалены записи оплат за период: ${formatPeriodLabel()}`
                          : 'Будут удалены ВСЕ записи оплат'
                        }. Это действие нельзя отменить.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearPayments}>Очистить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPmPage(0); setTxPage(0); }}>
              <TabsList>
                <TabsTrigger value="payments">Все попытки оплаты</TabsTrigger>
                <TabsTrigger value="transactions">Успешные транзакции</TabsTrigger>
              </TabsList>
            </Tabs>

            <FiltersRow />
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === 'payments' ? (
            // Payment orders tab
            pmLoading ? renderLoading() : payments.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет данных за выбранный период</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Пользователь</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Подписка</TableHead>
                        <TableHead>Сумма</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Создан</TableHead>
                        <TableHead>Оплачен</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id} className={
                          p.status === 'paid' ? 'bg-green-50/50 dark:bg-green-950/20' :
                          p.status === 'failed' ? 'bg-red-50/50 dark:bg-red-950/20' :
                          ''
                        }>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{p.user_name || 'Без имени'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{p.user_public_id || '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span>{p.subscription_name || '—'}</span>
                              {(p.metadata as any)?.is_special_offer && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">Акция</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">{p.amount.toLocaleString()} ₸</span>
                          </TableCell>
                          <TableCell>{getStatusBadge(p.status)}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate" title={p.payment_id || ''}>
                            {p.payment_id || '—'}
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(p.created_at), 'd.MM.yyyy HH:mm', { locale: ru })}</TableCell>
                          <TableCell className="text-xs">
                            {p.paid_at ? format(new Date(p.paid_at), 'd.MM.yyyy HH:mm', { locale: ru }) : '—'}
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить запись оплаты?</AlertDialogTitle>
                                  <AlertDialogDescription>Запись будет удалена безвозвратно.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeletePayment(p.id)}>Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pagination page={pmPage} totalPages={pmTotalPages} setPage={setPmPage} />
              </>
            )
          ) : (
            // Subscription transactions tab
            txLoading ? renderLoading() : transactions.length === 0 ? (
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
                        <TableHead>Подписка</TableHead>
                        <TableHead>Сумма</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Оплата</TableHead>
                        <TableHead>RRN / Payment ID</TableHead>
                        <TableHead>Дата</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{t.user_name || 'Без имени'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{t.user_public_id || '—'}</TableCell>
                          <TableCell>{t.user_phone?.startsWith('+telegram_') ? 'TG' : (t.user_phone || '—')}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span>{t.subscription_name}</span>
                              {t.is_special_offer && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">Акция</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {t.amount ? (
                              <span className="font-semibold">{t.amount.toLocaleString()} ₸</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                              t.transaction_type === 'purchase'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            }`}>
                              {t.transaction_type === 'purchase' ? (
                                <><CreditCard className="w-3 h-3" />Покупка</>
                              ) : (
                                <><Shield className="w-3 h-3" />Админ</>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.payment_method === 'paylink' ? 'Paylink' : (t.payment_method || '—')}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate" title={t.payment_id || ''}>
                            {t.payment_id || '—'}
                          </TableCell>
                          <TableCell>{format(new Date(t.created_at), 'd.MM.yyyy HH:mm', { locale: ru })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pagination page={txPage} totalPages={txTotalPages} setPage={setTxPage} />
              </>
            )
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
