import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { Search, ChevronLeft, ChevronRight, User } from 'lucide-react';

interface RedemptionWithUser {
  id: string;
  user_id: string;
  shop_name: string;
  drink_name: string;
  drink_type: string;
  redeemed_at: string;
  user_name: string | null;
  user_phone: string | null;
}

const PAGE_SIZE = 20;

export default function AdminHistoryPage() {
  const [redemptions, setRedemptions] = useState<RedemptionWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [shops, setShops] = useState<string[]>([]);

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchRedemptions();
  }, [page, shopFilter, typeFilter, search]);

  const fetchShops = async () => {
    const { data } = await supabase
      .from('shops')
      .select('name')
      .eq('is_active', true);
    if (data) {
      setShops(data.map(s => s.name));
    }
  };

  const fetchRedemptions = async () => {
    setIsLoading(true);
    try {
      // First get redemptions
      let query = supabase
        .from('redemptions')
        .select('*', { count: 'exact' });

      if (shopFilter !== 'all') {
        query = query.eq('shop_name', shopFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('drink_type', typeFilter);
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

      // Get user profiles for these redemptions
      const userIds = [...new Set(redemptionsData.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, phone')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Combine data
      let combined: RedemptionWithUser[] = redemptionsData.map(r => ({
        ...r,
        user_name: profileMap.get(r.user_id)?.name || null,
        user_phone: profileMap.get(r.user_id)?.phone || null,
      }));

      // Filter by search
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout title="История">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <CardTitle>Все выкупы ({totalCount})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени, телефону, напитку..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="pl-10"
                />
              </div>
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
                  <SelectItem value="drinks">Напитки</SelectItem>
                </SelectContent>
              </Select>
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
            <p className="text-muted-foreground text-center py-8">
              Нет данных
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Кофейня</TableHead>
                      <TableHead>Напиток</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Дата</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {r.user_name || 'Без имени'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{r.user_phone || '—'}</TableCell>
                        <TableCell>{r.shop_name}</TableCell>
                        <TableCell>{r.drink_name}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            r.drink_type === 'coffee' 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' 
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          }`}>
                            {r.drink_type === 'coffee' ? 'Кофе' : 'Напиток'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {new Date(r.redeemed_at).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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