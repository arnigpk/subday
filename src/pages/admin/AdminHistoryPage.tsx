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
  TableRow 
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Search, ChevronLeft, ChevronRight, Coffee, Wine } from 'lucide-react';

interface Redemption {
  id: string;
  user_id: string;
  shop_name: string;
  shop_id: string | null;
  drink_name: string;
  drink_type: string;
  redeemed_at: string;
}

const PAGE_SIZE = 20;

export default function AdminHistoryPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [shops, setShops] = useState<string[]>([]);

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    fetchRedemptions();
  }, [page, search, shopFilter, typeFilter]);

  const fetchShops = async () => {
    const { data } = await supabase
      .from('redemptions')
      .select('shop_name')
      .order('shop_name');

    if (data) {
      const uniqueShops = [...new Set(data.map(r => r.shop_name))];
      setShops(uniqueShops);
    }
  };

  const fetchRedemptions = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('redemptions')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.or(`drink_name.ilike.%${search}%,shop_name.ilike.%${search}%`);
      }

      if (shopFilter !== 'all') {
        query = query.eq('shop_name', shopFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('drink_type', typeFilter);
      }

      const { data, count, error } = await query
        .order('redeemed_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      setRedemptions(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching redemptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout title="История redemptions">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <CardTitle>Все redemptions ({totalCount})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по напитку или кофейне"
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
                  <SelectValue placeholder="Все кофейни" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все кофейни</SelectItem>
                  {shops.map(shop => (
                    <SelectItem key={shop} value={shop}>{shop}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Все типы" />
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
                      <TableHead>Тип</TableHead>
                      <TableHead>Напиток</TableHead>
                      <TableHead>Кофейня</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Время</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((redemption) => (
                      <TableRow key={redemption.id}>
                        <TableCell>
                          {redemption.drink_type === 'coffee' ? (
                            <Coffee className="w-4 h-4 text-amber-600" />
                          ) : (
                            <Wine className="w-4 h-4 text-purple-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {redemption.drink_name}
                        </TableCell>
                        <TableCell>{redemption.shop_name}</TableCell>
                        <TableCell>
                          {new Date(redemption.redeemed_at).toLocaleDateString('ru-RU')}
                        </TableCell>
                        <TableCell>
                          {new Date(redemption.redeemed_at).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
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
