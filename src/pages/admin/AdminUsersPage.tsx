import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Search, ChevronLeft, ChevronRight, Pencil, Ban, UserCheck, Shield } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAdminAuth';

type UserRole = AppRole | 'user';

interface UserWithStats {
  user_id: string;
  name: string | null;
  phone: string;
  city: string | null;
  created_at: string;
  is_blocked: boolean;
  coffee_remaining: number;
  drinks_remaining: number;
  total_cups: number;
  current_streak: number;
  role?: UserRole;
  role_id?: string;
  shop_id?: string | null;
}

interface SubscriptionType {
  id: string;
  name: string;
  type: string;
  cups_count: number;
  duration_days: number;
}

interface Shop {
  id: string;
  name: string;
}

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Пользователь',
  admin: 'Администратор',
  moderator: 'Модератор',
  partner: 'Партнёр',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null);
  const [subscriptionTypes, setSubscriptionTypes] = useState<SubscriptionType[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    city: '',
    is_blocked: false,
    coffee_remaining: 0,
    drinks_remaining: 0,
    role: 'user' as UserRole,
    shop_id: '',
  });
  const [selectedSubscription, setSelectedSubscription] = useState<string>('');

  useEffect(() => {
    fetchUsers();
    fetchSubscriptionTypes();
    fetchShops();
  }, [page, search]);

  const fetchSubscriptionTypes = async () => {
    const { data } = await supabase
      .from('subscription_types')
      .select('id, name, type, cups_count, duration_days')
      .eq('is_active', true);
    if (data) setSubscriptionTypes(data);
  };

  const fetchShops = async () => {
    const { data } = await supabase
      .from('shops')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');
    if (data) setShops(data);
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('profiles')
        .select('user_id, name, phone, city, created_at, is_blocked', { count: 'exact' });

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

      const userIds = profiles.map(p => p.user_id);
      
      // Fetch stats and roles in parallel
      const [statsResult, rolesResult] = await Promise.all([
        supabase
          .from('user_stats')
          .select('user_id, coffee_remaining, drinks_remaining, total_cups, current_streak')
          .in('user_id', userIds),
        supabase
          .from('user_roles')
          .select('id, user_id, role, shop_id')
          .in('user_id', userIds)
      ]);

      const statsMap = new Map(statsResult.data?.map(s => [s.user_id, s]) || []);
      const rolesMap = new Map(rolesResult.data?.map(r => [r.user_id, r]) || []);

      const usersWithStats: UserWithStats[] = profiles.map(profile => {
        const roleData = rolesMap.get(profile.user_id);
        return {
          ...profile,
          is_blocked: profile.is_blocked || false,
          coffee_remaining: statsMap.get(profile.user_id)?.coffee_remaining || 0,
          drinks_remaining: statsMap.get(profile.user_id)?.drinks_remaining || 0,
          total_cups: statsMap.get(profile.user_id)?.total_cups || 0,
          current_streak: statsMap.get(profile.user_id)?.current_streak || 0,
          role: (roleData?.role as UserRole) || 'user',
          role_id: roleData?.id,
          shop_id: roleData?.shop_id,
        };
      });

      setUsers(usersWithStats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (user: UserWithStats) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      phone: user.phone,
      city: user.city || '',
      is_blocked: user.is_blocked,
      coffee_remaining: user.coffee_remaining,
      drinks_remaining: user.drinks_remaining,
      role: user.role || 'user',
      shop_id: user.shop_id || '',
    });
    setSelectedSubscription('');
  };

  const handleSave = async () => {
    if (!editingUser) return;

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: formData.name || null,
          city: formData.city || null,
          is_blocked: formData.is_blocked,
        })
        .eq('user_id', editingUser.user_id);

      if (profileError) throw profileError;

      // Update stats
      const { error: statsError } = await supabase
        .from('user_stats')
        .update({
          coffee_remaining: formData.coffee_remaining,
          drinks_remaining: formData.drinks_remaining,
        })
        .eq('user_id', editingUser.user_id);

      if (statsError) throw statsError;

      // Handle role update
      const previousRole = editingUser.role || 'user';
      const newRole = formData.role;

      if (previousRole !== newRole) {
        if (previousRole !== 'user' && editingUser.role_id) {
          // Delete existing role
          await supabase
            .from('user_roles')
            .delete()
            .eq('id', editingUser.role_id);
        }

        if (newRole !== 'user') {
          // Insert new role
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: editingUser.user_id,
              role: newRole,
              shop_id: newRole === 'partner' ? formData.shop_id || null : null,
            });

          if (roleError) throw roleError;
        }
      } else if (newRole === 'partner' && formData.shop_id !== editingUser.shop_id) {
        // Update shop_id for partner
        if (editingUser.role_id) {
          await supabase
            .from('user_roles')
            .update({ shop_id: formData.shop_id || null })
            .eq('id', editingUser.role_id);
        }
      }

      toast({ title: 'Пользователь обновлён' });
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      toast({ title: 'Ошибка сохранения', variant: 'destructive' });
    }
  };

  const handleAddSubscription = async () => {
    if (!editingUser || !selectedSubscription) return;

    const subType = subscriptionTypes.find(s => s.id === selectedSubscription);
    if (!subType) return;

    try {
      // Use the activate_subscription function for proper expiration handling
      const { data, error } = await supabase.rpc('activate_subscription', {
        _user_id: editingUser.user_id,
        _subscription_type_id: selectedSubscription,
      });

      if (error) throw error;

      // Parse the response (it's a JSON object from the function)
      const result = data as { success: boolean; error?: string; cups_count?: number; expires_at?: string; subscription_id?: string } | null;

      if (!result?.success) {
        throw new Error(result?.error || 'Unknown error');
      }

      // Update local form state with new values
      if (subType.type === 'coffee') {
        setFormData(prev => ({ 
          ...prev, 
          coffee_remaining: result.cups_count || subType.cups_count,
          coffee_total: result.cups_count || subType.cups_count 
        }));
      } else {
        setFormData(prev => ({ 
          ...prev, 
          drinks_remaining: result.cups_count || subType.cups_count,
          drinks_total: result.cups_count || subType.cups_count 
        }));
      }

      const expiresAt = result.expires_at ? new Date(result.expires_at) : new Date(Date.now() + subType.duration_days * 24 * 60 * 60 * 1000);
      const formattedDate = expiresAt.toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });

      toast({ 
        title: `Подписка "${subType.name}" активирована`,
        description: `Действует до ${formattedDate}`
      });
      setSelectedSubscription('');
      fetchUsers();
    } catch (error) {
      console.error('Error adding subscription:', error);
      toast({ title: 'Ошибка добавления подписки', variant: 'destructive' });
    }
  };

  const handleToggleBlock = async (user: UserWithStats) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_blocked: !user.is_blocked })
        .eq('user_id', user.user_id);

      if (error) throw error;
      toast({ title: user.is_blocked ? 'Пользователь разблокирован' : 'Пользователь заблокирован' });
      fetchUsers();
    } catch (error) {
      console.error('Error toggling block:', error);
      toast({ title: 'Ошибка', variant: 'destructive' });
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
                      <TableHead>Статус</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.user_id} className={user.is_blocked ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">
                          {user.name || '—'}
                        </TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell>{user.city || '—'}</TableCell>
                        <TableCell className="text-center">{user.coffee_remaining}</TableCell>
                        <TableCell className="text-center">{user.drinks_remaining}</TableCell>
                        <TableCell className="text-center">{user.total_cups}</TableCell>
                        <TableCell>
                          {user.role && user.role !== 'user' && (
                            <div className="flex items-center gap-1 mb-1">
                              <Shield className="w-3 h-3 text-primary" />
                              <span className="text-xs text-primary font-medium">
                                {ROLE_LABELS[user.role]}
                              </span>
                            </div>
                          )}
                          {user.is_blocked ? (
                            <span className="text-destructive text-sm">Заблокирован</span>
                          ) : (
                            <span className="text-green-600 text-sm">Активен</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleBlock(user)}
                            >
                              {user.is_blocked ? (
                                <UserCheck className="w-4 h-4 text-green-600" />
                              ) : (
                                <Ban className="w-4 h-4 text-destructive" />
                              )}
                            </Button>
                          </div>
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

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать пользователя</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                value={formData.phone}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="city">Город</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="coffee">Остаток кофе</Label>
                <Input
                  id="coffee"
                  type="number"
                  min="0"
                  value={formData.coffee_remaining}
                  onChange={(e) => setFormData({ ...formData, coffee_remaining: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label htmlFor="drinks">Остаток напитков</Label>
                <Input
                  id="drinks"
                  type="number"
                  min="0"
                  value={formData.drinks_remaining}
                  onChange={(e) => setFormData({ ...formData, drinks_remaining: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <Label>Роль пользователя</Label>
              <Select 
                value={formData.role} 
                onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Пользователь</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="moderator">Модератор</SelectItem>
                  <SelectItem value="partner">Партнёр</SelectItem>
                </SelectContent>
              </Select>
              
              {formData.role === 'partner' && (
                <div className="mt-3">
                  <Label>Привязка к кофейне</Label>
                  <Select 
                    value={formData.shop_id} 
                    onValueChange={(v) => setFormData({ ...formData, shop_id: v })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Выберите кофейню" />
                    </SelectTrigger>
                    <SelectContent>
                      {shops.map(shop => (
                        <SelectItem key={shop.id} value={shop.id}>
                          {shop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_blocked"
                checked={formData.is_blocked}
                onCheckedChange={(checked) => setFormData({ ...formData, is_blocked: checked })}
              />
              <Label htmlFor="is_blocked">Заблокирован</Label>
            </div>

            <div className="border-t pt-4">
              <Label>Добавить подписку</Label>
              <div className="flex gap-2 mt-2">
                <Select value={selectedSubscription} onValueChange={setSelectedSubscription}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Выберите подписку" />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriptionTypes.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name} ({sub.cups_count} {sub.type === 'coffee' ? 'кофе' : 'напитков'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddSubscription} disabled={!selectedSubscription}>
                  Добавить
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Отмена
              </Button>
              <Button onClick={handleSave}>
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
