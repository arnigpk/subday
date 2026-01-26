import { useState, useEffect } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { Loader2, UserPlus, Trash2, Users, Search } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Barista {
  id: string;
  userId: string;
  name: string | null;
  phone: string;
}

export default function PartnerStaffPage() {
  const { shopId, isLoading: authLoading } = usePartnerAuth();
  const [baristas, setBaristas] = useState<Barista[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchPhone, setSearchPhone] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{ userId: string; name: string | null; phone: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteBarista, setDeleteBarista] = useState<Barista | null>(null);

  const fetchBaristas = async () => {
    if (!shopId) return;

    try {
      // Fetch barista roles for this shop
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('id, user_id')
        .eq('shop_id', shopId)
        .eq('role', 'barista');

      if (error) {
        console.error('Error fetching baristas:', error);
        return;
      }

      if (!roles || roles.length === 0) {
        setBaristas([]);
        return;
      }

      // Fetch profiles for these users
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, phone')
        .in('user_id', userIds);

      const profileMap = new Map(
        profiles?.map(p => [p.user_id, { name: p.name, phone: p.phone }]) || []
      );

      const formattedBaristas: Barista[] = roles.map(r => ({
        id: r.id,
        userId: r.user_id,
        name: profileMap.get(r.user_id)?.name || null,
        phone: profileMap.get(r.user_id)?.phone || 'Неизвестно',
      }));

      setBaristas(formattedBaristas);
    } catch (error) {
      console.error('Error fetching baristas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !shopId) return;
    fetchBaristas();
  }, [shopId, authLoading]);

  const handleSearch = async () => {
    if (!searchPhone.trim()) {
      toast.error('Введите номер телефона');
      return;
    }

    setIsSearching(true);
    setFoundUser(null);

    try {
      // Search for user by phone
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, name, phone')
        .ilike('phone', `%${searchPhone.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Search error:', error);
        toast.error('Ошибка поиска');
        return;
      }

      if (!data) {
        toast.error('Пользователь не найден');
        return;
      }

      // Check if already a barista
      const isAlreadyBarista = baristas.some(b => b.userId === data.user_id);
      if (isAlreadyBarista) {
        toast.error('Этот пользователь уже является баристой');
        return;
      }

      setFoundUser({
        userId: data.user_id,
        name: data.name,
        phone: data.phone,
      });
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Ошибка поиска');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddBarista = async () => {
    if (!foundUser || !shopId) return;

    setIsAdding(true);

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: foundUser.userId,
          role: 'barista',
          shop_id: shopId,
        });

      if (error) {
        console.error('Error adding barista:', error);
        toast.error('Ошибка при добавлении');
        return;
      }

      toast.success('Бариста успешно добавлен');
      setFoundUser(null);
      setSearchPhone('');
      fetchBaristas();
    } catch (error) {
      console.error('Error adding barista:', error);
      toast.error('Ошибка при добавлении');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteBarista = async () => {
    if (!deleteBarista) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', deleteBarista.id);

      if (error) {
        console.error('Error deleting barista:', error);
        toast.error('Ошибка при удалении');
        return;
      }

      toast.success('Бариста удалён');
      setDeleteBarista(null);
      fetchBaristas();
    } catch (error) {
      console.error('Error deleting barista:', error);
      toast.error('Ошибка при удалении');
    }
  };

  if (authLoading || isLoading) {
    return (
      <PartnerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PartnerLayout>
    );
  }

  return (
    <PartnerLayout>
      <div className="p-4 space-y-6">
        <h2 className="text-xl font-bold text-foreground">Сотрудники</h2>

        {/* Add barista section */}
        <div className="bg-card p-4 rounded-xl border border-border space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <UserPlus size={18} />
            Добавить баристу
          </h3>
          
          <div className="flex gap-2">
            <Input
              placeholder="Номер телефона"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Search size={18} />
              )}
            </Button>
          </div>

          {foundUser && (
            <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">
                  {foundUser.name || 'Без имени'}
                </p>
                <p className="text-sm text-muted-foreground">{foundUser.phone}</p>
              </div>
              <Button onClick={handleAddBarista} disabled={isAdding} size="sm">
                {isAdding ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Добавить'
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Baristas list */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Users size={18} />
            Текущие бариста ({baristas.length})
          </h3>

          {baristas.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Нет добавленных бариста</p>
            </div>
          ) : (
            <div className="space-y-2">
              {baristas.map((barista) => (
                <div
                  key={barista.id}
                  className="bg-card p-4 rounded-xl border border-border flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {barista.name || 'Без имени'}
                    </p>
                    <p className="text-sm text-muted-foreground">{barista.phone}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteBarista(barista)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteBarista} onOpenChange={() => setDeleteBarista(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить баристу?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBarista?.name || 'Этот пользователь'} больше не сможет сканировать QR-коды.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBarista}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PartnerLayout>
  );
}
