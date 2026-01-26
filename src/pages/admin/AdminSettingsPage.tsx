import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth, AppRole } from '@/hooks/useAdminAuth';
import { Plus, Trash2, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  shop_id: string | null;
  created_at: string;
  user_name?: string;
  user_phone?: string;
}

export default function AdminSettingsPage() {
  const { isAdmin } = useAdminAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('moderator');
  const [newShopId, setNewShopId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchRoles();
    }
  }, [isAdmin]);

  const fetchRoles = async () => {
    try {
      const { data: rolesData, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!rolesData) {
        setRoles([]);
        return;
      }

      // Get user info for each role
      const userIds = rolesData.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, phone')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const rolesWithUsers: UserRole[] = rolesData.map(role => ({
        ...role,
        role: role.role as AppRole,
        user_name: profileMap.get(role.user_id)?.name || undefined,
        user_phone: profileMap.get(role.user_id)?.phone || undefined,
      }));

      setRoles(rolesWithUsers);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRole = async () => {
    if (!newPhone) {
      toast.error('Введите номер телефона');
      return;
    }

    setIsAdding(true);
    try {
      // Find user by phone
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('phone', newPhone)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        toast.error('Пользователь с таким телефоном не найден');
        setIsAdding(false);
        return;
      }

      // Add role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: profile.user_id,
          role: newRole,
          shop_id: newRole === 'partner' ? newShopId || null : null,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error('У этого пользователя уже есть такая роль');
        } else {
          throw insertError;
        }
        setIsAdding(false);
        return;
      }

      toast.success('Роль добавлена');
      setIsDialogOpen(false);
      setNewPhone('');
      setNewRole('moderator');
      setNewShopId('');
      fetchRoles();
    } catch (error) {
      console.error('Error adding role:', error);
      toast.error('Ошибка при добавлении роли');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      toast.success('Роль удалена');
      fetchRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error('Ошибка при удалении роли');
    }
  };

  const getRoleBadgeColor = (role: AppRole) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'moderator': return 'bg-blue-100 text-blue-800';
      case 'partner': return 'bg-green-100 text-green-800';
    }
  };

  if (!isAdmin) {
    return (
      <AdminLayout title="Настройки">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Только администраторы могут управлять ролями
            </p>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Управление ролями">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Роли пользователей</CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить роль
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Добавить роль</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Номер телефона
                    </label>
                    <Input
                      placeholder="+77077000994"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Роль
                    </label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="moderator">Moderator</SelectItem>
                        <SelectItem value="partner">Partner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newRole === 'partner' && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        ID кофейни
                      </label>
                      <Input
                        placeholder="coffee-shop-1"
                        value={newShopId}
                        onChange={(e) => setNewShopId(e.target.value)}
                      />
                    </div>
                  )}
                  <Button 
                    className="w-full" 
                    onClick={handleAddRole}
                    disabled={isAdding}
                  >
                    {isAdding ? 'Добавление...' : 'Добавить'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : roles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Нет назначенных ролей
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Кофейня</TableHead>
                  <TableHead>Добавлен</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      {role.user_name || '—'}
                    </TableCell>
                    <TableCell>{role.user_phone || '—'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(role.role)}`}>
                        {role.role}
                      </span>
                    </TableCell>
                    <TableCell>{role.shop_id || '—'}</TableCell>
                    <TableCell>
                      {new Date(role.created_at).toLocaleDateString('ru-RU')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRole(role.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
