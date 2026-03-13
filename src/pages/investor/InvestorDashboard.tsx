import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, Users, Percent, DollarSign, Calendar, LogOut } from 'lucide-react';

type PeriodFilter = 'all' | 'month' | 'custom';

interface Transaction {
  id: string;
  subscription_name: string;
  amount: number | null;
  created_at: string;
  transaction_type: string;
}

export default function InvestorDashboard() {
  const { session } = useAdminAuth();
  const [profitPercent, setProfitPercent] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    if (!session?.user) return;
    fetchInvestorSettings();
    fetchActiveSubscriptions();
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    fetchTransactions();
  }, [session, periodFilter, customFrom, customTo]);

  const fetchInvestorSettings = async () => {
    const { data } = await supabase
      .from('investor_settings')
      .select('profit_percent, note')
      .eq('user_id', session!.user.id)
      .maybeSingle();

    if (data) {
      setProfitPercent(Number(data.profit_percent));
      setNote(data.note || '');
    }
  };

  const fetchActiveSubscriptions = async () => {
    const { count } = await supabase
      .from('user_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    setActiveSubscriptions(count || 0);
  };

  const fetchTransactions = async () => {
    setIsLoading(true);
    let query = supabase
      .from('subscription_transactions')
      .select('id, subscription_name, amount, created_at, transaction_type')
      .order('created_at', { ascending: false });

    if (periodFilter === 'month') {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfMonth.toISOString());
    } else if (periodFilter === 'custom') {
      if (customFrom) query = query.gte('created_at', new Date(customFrom).toISOString());
      if (customTo) {
        const end = new Date(customTo);
        end.setDate(end.getDate() + 1);
        query = query.lt('created_at', end.toISOString());
      }
    }

    const { data } = await query;
    setTransactions(data || []);
    setIsLoading(false);
  };

  const totalAmount = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [transactions]);

  const earnings = useMemo(() => {
    return Math.round(totalAmount * profitPercent / 100);
  }, [totalAmount, profitPercent]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('ru-RU') + ' ₸';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Кабинет инвестора
          </h1>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {note && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
            📝 {note}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">Активных подписок</span>
              </div>
              <p className="text-3xl font-bold">{activeSubscriptions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Percent className="w-4 h-4" />
                <span className="text-xs">Ваш процент</span>
              </div>
              <p className="text-3xl font-bold text-primary">{profitPercent}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Ваш заработок</span>
            </div>
            <p className="text-4xl font-bold text-primary">{formatAmount(earnings)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              от общей суммы {formatAmount(totalAmount)}
            </p>
          </CardContent>
        </Card>

        {/* Period Filter */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Период</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'month', 'custom'] as PeriodFilter[]).map(p => (
              <Button
                key={p}
                variant={periodFilter === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriodFilter(p)}
              >
                {p === 'all' && 'За всё время'}
                {p === 'month' && 'Этот месяц'}
                {p === 'custom' && 'Произвольный'}
              </Button>
            ))}
          </div>
          {periodFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="w-40"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="w-40"
              />
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-1">Транзакций</p>
              <p className="text-2xl font-bold">{transactions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-1">Сумма</p>
              <p className="text-2xl font-bold">{formatAmount(totalAmount)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Последние транзакции</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет транзакций за выбранный период</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Подписка</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                      <TableHead className="text-right">Дата</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 50).map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.subscription_name}</TableCell>
                        <TableCell className="text-right">{t.amount ? formatAmount(t.amount) : '—'}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {new Date(t.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
