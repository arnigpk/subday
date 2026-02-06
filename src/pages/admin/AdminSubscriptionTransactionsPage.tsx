import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { CalendarIcon, ChevronLeft, ChevronRight, Trash2, User, CreditCard, Shield } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { toast } from '@/components/ui/sonner';

interface TransactionWithUser {
  id: string;
  user_id: string;
  subscription_name: string;
  transaction_type: string;
  created_at: string;
  user_name: string | null;
  user_phone: string | null;
}

type PeriodType = 'last_month' | 'custom' | 'all';

const PAGE_SIZE = 20;

export default function AdminSubscriptionTransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [periodType, setPeriodType] = useState<PeriodType>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchTransactions();
  }, [page, periodType, dateRange]);

  const getDateFilters = () => {
    const now = new Date();
    
    if (periodType === 'last_month') {
      const lastMonth = subMonths(now, 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      };
    }
    
    if (periodType === 'custom' && dateRange?.from) {
      return {
        from: startOfDay(dateRange.from),
        to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from),
      };
    }
    
    return null;
  };

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('subscription_transactions')
        .select('*', { count: 'exact' });

      const dateFilters = getDateFilters();
      if (dateFilters) {
        query = query.gte('created_at', dateFilters.from.toISOString());
        query = query.lte('created_at', dateFilters.to.toISOString());
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setTotalCount(count || 0);

      if (!data || data.length === 0) {
        setTransactions([]);
        setIsLoading(false);
        return;
      }

      // Get user profiles
      const userIds = [...new Set(data.map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, phone')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const combined: TransactionWithUser[] = data.map(t => ({
        ...t,
        user_name: profileMap.get(t.user_id)?.name || null,
        user_phone: profileMap.get(t.user_id)?.phone || null,
      }));

      setTransactions(combined);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    setPage(0);
    if (value !== 'custom') {
      setDateRange(undefined);
    }
  };

  const handleClearHistory = async () => {
    try {
      const dateFilters = getDateFilters();
      
      let query = supabase.from('subscription_transactions').delete();
      
      if (dateFilters) {
        query = query.gte('created_at', dateFilters.from.toISOString())
                     .lte('created_at', dateFilters.to.toISOString());
      } else {
        // Delete all - need to match on something, use gt with old date
        query = query.gt('created_at', '1970-01-01');
      }

      const { error } = await query;

      if (error) throw error;
      
      toast.success('История очищена');
      fetchTransactions();
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error('Ошибка очистки');
    }
  };

  const formatPeriodLabel = () => {
    if (periodType === 'last_month') {
      const lastMonth = subMonths(new Date(), 1);
      return format(lastMonth, 'LLLL yyyy', { locale: ru });
    }
    if (periodType === 'custom' && dateRange?.from) {
      if (dateRange.to) {
        return `${format(dateRange.from, 'd MMM', { locale: ru })} - ${format(dateRange.to, 'd MMM yyyy', { locale: ru })}`;
      }
      return format(dateRange.from, 'd MMMM yyyy', { locale: ru });
    }
    return 'Все время';
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout title="Транзакции подписок">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Всего транзакций ({totalCount})</CardTitle>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Очистить историю
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Очистить историю транзакций?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {periodType !== 'all' 
                        ? `Будут удалены транзакции за период: ${formatPeriodLabel()}`
                        : 'Будут удалены ВСЕ транзакции'
                      }. Это действие нельзя отменить.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearHistory}>
                      Очистить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            {/* Period filter */}
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
                          <>
                            {format(dateRange.from, 'd MMM', { locale: ru })} - {format(dateRange.to, 'd MMM yyyy', { locale: ru })}
                          </>
                        ) : (
                          format(dateRange.from, 'd MMMM yyyy', { locale: ru })
                        )
                      ) : (
                        'Выберите даты'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(range) => {
                        setDateRange(range);
                        setPage(0);
                      }}
                      numberOfMonths={1}
                      locale={ru}
                    />
                  </PopoverContent>
                </Popover>
              )}
              
              {periodType !== 'all' && (
                <span className="text-sm text-muted-foreground">
                  Период: {formatPeriodLabel()}
                </span>
              )}
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
          ) : transactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Нет данных за выбранный период
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Подписка</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Дата</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {t.user_name || 'Без имени'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{t.user_phone || '—'}</TableCell>
                        <TableCell>{t.subscription_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                            t.transaction_type === 'purchase'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          }`}>
                            {t.transaction_type === 'purchase' ? (
                              <>
                                <CreditCard className="w-3 h-3" />
                                Покупка
                              </>
                            ) : (
                              <>
                                <Shield className="w-3 h-3" />
                                Активация админом
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {format(new Date(t.created_at), 'd.MM.yyyy HH:mm', { locale: ru })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Страница {page + 1} из {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
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
