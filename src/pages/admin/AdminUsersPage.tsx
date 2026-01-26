import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface UserWithStats {
  user_id: string;
  name: string | null;
  phone: string;
  city: string | null;
  created_at: string;
  coffee_remaining: number;
  drinks_remaining: number;
  total_cups: number;
  current_streak: number;
}

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Get profiles with pagination
      let query = supabase
        .from('profiles')
        .select('user_id, name, phone, city, created_at', { count: 'exact' });

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data: profiles, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      setTotalCount(count || 0);

      if (!profiles || profiles.length === 0) {
        setUsers([]);
        setIsLoading(false);
        return;
      }

      // Get stats for these users
      const userIds = profiles.map(p => p.user_id);
      const { data: stats } = await supabase
        .from('user_stats')
        .select('user_id, coffee_remaining, drinks_remaining, total_cups, current_streak')
        .in('user_id', userIds);

      const statsMap = new Map(stats?.map(s => [s.user_id, s]) || []);

      const usersWithStats: UserWithStats[] = profiles.map(profile => ({
        ...profile,
        coffee_remaining: statsMap.get(profile.user_id)?.coffee_remaining || 0,
        drinks_remaining: statsMap.get(profile.user_id)?.drinks_remaining || 0,
        total_cups: statsMap.get(profile.user_id)?.total_cups || 0,
        current_streak: statsMap.get(profile.user_id)?.current_streak || 0,
      }));

      setUsers(usersWithStats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <AdminLayout title="Пользователи">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle>Все пользователи ({totalCount})</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или телефону"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-10"
              />
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
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {search ? 'Пользователи не найдены' : 'Нет пользователей'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Имя</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Город</TableHead>
                      <TableHead className="text-center">Кофе</TableHead>
                      <TableHead className="text-center">Напитки</TableHead>
                      <TableHead className="text-center">Всего</TableHead>
                      <TableHead className="text-center">Streak</TableHead>
                      <TableHead>Регистрация</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">
                          {user.name || '—'}
                        </TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell>{user.city || '—'}</TableCell>
                        <TableCell className="text-center">{user.coffee_remaining}</TableCell>
                        <TableCell className="text-center">{user.drinks_remaining}</TableCell>
                        <TableCell className="text-center">{user.total_cups}</TableCell>
                        <TableCell className="text-center">{user.current_streak}</TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString('ru-RU')}
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
