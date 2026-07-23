import { useEffect, useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { getCitiesForCountry } from '@/utils/countries';
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
import { Search, ChevronLeft, ChevronRight, Pencil, Ban, UserCheck, Shield, CalendarDays, Coffee, UtensilsCrossed, RefreshCw, CreditCard, Plus, X, Store, Gift, Snowflake, Building2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AppRole, useAdminAuth } from '@/hooks/useAdminAuth';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';

type UserRole = AppRole | 'user';

const COUNTRY_LABELS: Record<string, string> = {
  KZ: '🇰🇿 Казахстан',
  KG: '🇰🇬 Кыргызстан',
  UZ: '🇺🇿 Узбекистан',
  RU: '🇷🇺 Россия',
};

interface UserWithStats {
  user_id: string;
  name: string | null;
  phone: string;
  public_id: string;
  city: string | null;
  country: string | null;
  created_at: string;
  is_blocked: boolean;
  subflow_access: boolean;
  ai_access: boolean;
  coffee_remaining: number;
  drinks_remaining: number;
  guest_coffees: number;
  guest_expires_at: string | null;
  total_cups: number;
  current_streak: number;
  role?: UserRole;
  role_id?: string;
  shop_id?: string | null;
  coffee_subscription?: { name: string; expires_at: string | null; sub_id: string; daily_limit: number | null; daily_limit_override: number | null; is_frozen: boolean; freeze_until: string | null } | null;
  lunch_subscription?: { name: string; expires_at: string | null; sub_id: string; daily_limit: number | null; daily_limit_override: number | null; is_frozen: boolean; freeze_until: string | null } | null;
  b2b_owner_of?: string | null;   // название бизнеса, если пользователь — админ B2B-аккаунта
  b2b_seat?: { account: string; tier: string } | null; // выданное B2B-место
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
  superadmin: 'СуперАдмин',
  admin: 'Администратор',
  moderator: 'Модератор',
  partner: 'Партнёр',
  barista: 'Бариста',
};

function formatExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return '—';
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Истёк';
  const daysWord = days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : 'дней';
  return `~${days} ${daysWord} (до ${new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })})`;
}

function SubscriptionRow({ sub, icon, type, canManage, onReset, onResetDailyLimit }: {
  sub: { name: string; expires_at: string | null; daily_limit: number | null; daily_limit_override: number | null; is_frozen?: boolean; freeze_until?: string | null };
  icon: React.ReactNode;
  type: string;
  canManage: boolean;
  onReset: () => void;
  onResetDailyLimit: () => void;
}) {
  const effectiveLimit = sub.daily_limit_override ?? sub.daily_limit;
  // Заморожена = флаг + срок в будущем (cron сам снимает заморозку по истечении).
  const isFrozenNow = !!sub.is_frozen && !!sub.freeze_until && new Date(sub.freeze_until) > new Date();

  return (
    <div className={`rounded-lg px-3 py-2 space-y-1 ${isFrozenNow ? 'bg-sky-50 dark:bg-sky-950/30 ring-1 ring-sky-200 dark:ring-sky-900' : 'bg-secondary/50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <span className="text-sm font-medium">{sub.name}</span>
          {isFrozenNow && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-[11px] font-medium px-2 py-0.5">
              <Snowflake className="w-3 h-3" />
              Заморожена до {new Date(sub.freeze_until!).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatExpiryLabel(sub.expires_at)}
          </span>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onReset}
            >
              Обнулить
            </Button>
          )}
        </div>
      </div>
      {/* Daily limit row */}
      {effectiveLimit !== null && effectiveLimit !== undefined && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Дневной лимит: {effectiveLimit}
          </span>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={onResetDailyLimit}
            >
              <RefreshCw className="w-3 h-3" />
              Обновить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const { canManage, isSuperAdmin, isAdmin } = useAdminAuth();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null);
  const [subscriptionTypes, setSubscriptionTypes] = useState<SubscriptionType[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [registrationFilter, setRegistrationFilter] = useState<string>('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    city: '',
    country: 'KZ',
    is_blocked: false,
    coffee_remaining: 0,
    drinks_remaining: 0,
    role: 'user' as UserRole,
    shop_id: '',
    subflow_access: false,
    ai_access: false,
  });
  const [selectedSubscription, setSelectedSubscription] = useState<string>('');
  const [partnerShopIds, setPartnerShopIds] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchSubscriptionTypes();
    fetchShops();
  }, [page, search, registrationFilter, subscriptionFilter, countryFilter, cityFilter, customDateFrom, customDateTo]);

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
      // If subscription filter is active, first get relevant user_ids
      let subscribedUserIds: string[] | null = null;
      if (subscriptionFilter === 'has_subscription' || subscriptionFilter === 'no_subscription') {
        const { data: subUsers } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('is_active', true);
        subscribedUserIds = [...new Set((subUsers || []).map(s => s.user_id))];
      }

      // Фильтр «Заморозка»: активная подписка с флагом заморозки и сроком в
      // будущем (та же семантика, что в сканере: is_frozen && freeze_until > now).
      let frozenUserIds: string[] | null = null;
      if (subscriptionFilter === 'frozen') {
        const { data: frozen } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('is_active', true)
          .eq('is_frozen', true)
          .gt('freeze_until', new Date().toISOString());
        frozenUserIds = [...new Set((frozen || []).map(s => s.user_id))];
      }

      let query = supabase
        .from('profiles')
        .select('user_id, name, phone, public_id, city, country, created_at, is_blocked, subflow_access, ai_access', { count: 'exact' });

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,public_id.ilike.%${search}%`);
      }
      if (countryFilter !== 'all') {
        query = query.eq('country', countryFilter);
      }
      if (cityFilter !== 'all') {
        query = query.eq('city', cityFilter);
      }

      // Subscription filter
      if (subscriptionFilter === 'frozen') {
        if (!frozenUserIds || frozenUserIds.length === 0) {
          setUsers([]);
          setTotalCount(0);
          setIsLoading(false);
          return;
        }
        query = query.in('user_id', frozenUserIds);
      } else if (subscriptionFilter === 'has_subscription' && subscribedUserIds) {
        if (subscribedUserIds.length === 0) {
          setUsers([]);
          setTotalCount(0);
          setIsLoading(false);
          return;
        }
        query = query.in('user_id', subscribedUserIds);
      } else if (subscriptionFilter === 'no_subscription' && subscribedUserIds) {
        if (subscribedUserIds.length > 0) {
          // Supabase doesn't have "not in" easily, so we use a workaround
          // We'll filter client-side after fetching all, but for large datasets
          // we need a different approach. Let's use .not().in() 
          query = query.not('user_id', 'in', `(${subscribedUserIds.join(',')})`);
        }
      }

      // Registration date filter
      if (registrationFilter === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', weekAgo);
      } else if (registrationFilter === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', monthAgo);
      } else if (registrationFilter === 'custom') {
        if (customDateFrom) {
          query = query.gte('created_at', new Date(customDateFrom).toISOString());
        }
        if (customDateTo) {
          const endDate = new Date(customDateTo);
          endDate.setDate(endDate.getDate() + 1);
          query = query.lt('created_at', endDate.toISOString());
        }
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
      
      // Fetch stats, roles, subscriptions and B2B links in parallel
      const [statsResult, rolesResult, subsResult, b2bOwnersResult, b2bSeatsResult] = await Promise.all([
        supabase
          .from('user_stats')
          .select('user_id, coffee_remaining, drinks_remaining, guest_coffees, guest_expires_at, total_cups, current_streak')
          .in('user_id', userIds),
        supabase
          .from('user_roles')
          .select('id, user_id, role, shop_id')
          .in('user_id', userIds),
        supabase
          .from('user_subscriptions')
          .select('id, user_id, expires_at, is_active, daily_limit_override, is_frozen, freeze_until, subscription_types(name, type, daily_limit)')
          .in('user_id', userIds)
          .eq('is_active', true),
        // Владельцы B2B-аккаунтов среди показанных пользователей.
        supabase
          .from('b2b_accounts')
          .select('admin_user_id, name')
          .in('admin_user_id', userIds),
        // Сотрудники с активным B2B-местом (название бизнеса + тариф).
        supabase
          .from('b2b_seats')
          .select('employee_user_id, b2b_accounts(name), b2b_allocations(subscription_types(name))')
          .in('employee_user_id', userIds)
          .eq('status', 'active'),
      ]);

      const statsMap = new Map(statsResult.data?.map(s => [s.user_id, s]) || []);
      // b2b_admin — служебная роль B2B-кабинета, ею управляет раздел «B2B», а не
      // общий переключатель ролей. Исключаем её из определения основной роли,
      // иначе у B2B-владельца показывался бы «щит» без подписи и пустая выпадашка.
      const rolesMap = new Map((rolesResult.data || []).filter(r => r.role !== 'b2b_admin').map(r => [r.user_id, r]));
      const b2bOwnerMap = new Map<string, string>();
      for (const a of (b2bOwnersResult.data || [])) {
        if (a.admin_user_id) b2bOwnerMap.set(a.admin_user_id, a.name);
      }
      const b2bSeatMap = new Map<string, { account: string; tier: string }>();
      for (const s of (b2bSeatsResult.data || [])) {
        const acc = (s as any).b2b_accounts as { name: string } | null;
        const tier = ((s as any).b2b_allocations as { subscription_types: { name: string } | null } | null)?.subscription_types?.name;
        b2bSeatMap.set((s as any).employee_user_id, { account: acc?.name || 'Бизнес', tier: tier || 'Подписка' });
      }
      
      type SubInfo = { name: string; expires_at: string | null; sub_id: string; daily_limit: number | null; daily_limit_override: number | null; is_frozen: boolean; freeze_until: string | null };
      const coffeeSubMap = new Map<string, SubInfo>();
      const lunchSubMap = new Map<string, SubInfo>();
      for (const sub of (subsResult.data || [])) {
        const subType = sub.subscription_types as unknown as { name: string; type: string; daily_limit: number | null } | null;
        if (!subType) continue;
        const raw = sub as { daily_limit_override?: number | null; is_frozen?: boolean | null; freeze_until?: string | null };
        const info: SubInfo = {
          name: subType.name,
          expires_at: sub.expires_at,
          sub_id: sub.id,
          daily_limit: subType.daily_limit,
          daily_limit_override: raw.daily_limit_override ?? null,
          is_frozen: raw.is_frozen ?? false,
          freeze_until: raw.freeze_until ?? null,
        };
        if (subType.type === 'coffee') {
          coffeeSubMap.set(sub.user_id, info);
        } else if (subType.type === 'drinks') {
          lunchSubMap.set(sub.user_id, info);
        }
      }

      const usersWithStats: UserWithStats[] = profiles.map(profile => {
        const roleData = rolesMap.get(profile.user_id);
        return {
          ...profile,
          is_blocked: profile.is_blocked || false,
          subflow_access: (profile as any).subflow_access || false,
          ai_access: (profile as any).ai_access || false,
          coffee_remaining: statsMap.get(profile.user_id)?.coffee_remaining || 0,
          drinks_remaining: statsMap.get(profile.user_id)?.drinks_remaining || 0,
          guest_coffees: statsMap.get(profile.user_id)?.guest_coffees || 0,
          guest_expires_at: statsMap.get(profile.user_id)?.guest_expires_at || null,
          total_cups: statsMap.get(profile.user_id)?.total_cups || 0,
          current_streak: statsMap.get(profile.user_id)?.current_streak || 0,
          role: (roleData?.role as UserRole) || 'user',
          role_id: roleData?.id,
          shop_id: roleData?.shop_id,
          coffee_subscription: coffeeSubMap.get(profile.user_id) || null,
          lunch_subscription: lunchSubMap.get(profile.user_id) || null,
          b2b_owner_of: b2bOwnerMap.get(profile.user_id) || null,
          b2b_seat: b2bSeatMap.get(profile.user_id) || null,
        };
      });

      setUsers(usersWithStats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = async (user: UserWithStats) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      phone: user.phone,
      city: user.city || '',
      country: user.country || 'KZ',
      is_blocked: user.is_blocked,
      coffee_remaining: user.coffee_remaining,
      drinks_remaining: user.drinks_remaining,
      role: user.role || 'user',
      shop_id: user.shop_id || '',
      subflow_access: user.subflow_access || false,
      ai_access: user.ai_access || false,
    });
    setSelectedSubscription('');

    if (user.role === 'partner') {
      const { data } = await supabase
        .from('user_roles')
        .select('shop_id')
        .eq('user_id', user.user_id)
        .eq('role', 'partner');
      setPartnerShopIds((data?.map(r => r.shop_id).filter(Boolean) as string[]) || []);
    } else {
      setPartnerShopIds([]);
    }
  };

  const handleSave = async () => {
    if (!editingUser) return;

    try {
      // Guard: prevent changing superadmin role to anything else
      const previousRole = editingUser.role || 'user';
      const newRole = formData.role;

      if (previousRole === 'superadmin' && newRole !== 'superadmin' && editingUser.public_id === '773158') {
        toast({ title: '⚠️ Нельзя изменить роль СуперАдмина', description: 'Роль главного СуперАдмина защищена от изменений', variant: 'destructive' });
        return;
      }

      // Admin cannot assign superadmin role
      if (!isSuperAdmin && newRole === 'superadmin') {
        toast({ title: 'Нельзя назначить роль СуперАдмина', variant: 'destructive' });
        return;
      }

      // SuperAdmin can update everything, admin can only update roles
      if (canManage) {
        // Update profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            name: formData.name || null,
            city: formData.city || null,
            country: formData.country || 'KZ',
            is_blocked: formData.is_blocked,
            subflow_access: formData.subflow_access,
            ai_access: formData.ai_access,
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
      }

      if (newRole === 'partner' && previousRole === 'partner') {
        // Diff existing shops vs selected shops
        const { data: currentRoles } = await supabase
          .from('user_roles')
          .select('id, shop_id')
          .eq('user_id', editingUser.user_id)
          .eq('role', 'partner');
        const currentShopIds = (currentRoles?.map(r => r.shop_id).filter(Boolean) as string[]) || [];

        // Remove deselected shops
        for (const r of currentRoles || []) {
          if (r.shop_id && !partnerShopIds.includes(r.shop_id)) {
            await supabase.from('user_roles').delete().eq('id', r.id);
          }
        }
        // Add new shops
        for (const shopId of partnerShopIds) {
          if (!currentShopIds.includes(shopId)) {
            await supabase.from('user_roles').insert({ user_id: editingUser.user_id, role: 'partner', shop_id: shopId });
          }
        }
      } else if (newRole === 'partner' && previousRole !== 'partner') {
        // Remove old non-partner role
        if (previousRole !== 'user' && editingUser.role_id) {
          await supabase.from('user_roles').delete().eq('id', editingUser.role_id);
        }
        // Insert a row per selected shop
        for (const shopId of partnerShopIds) {
          await supabase.from('user_roles').insert({ user_id: editingUser.user_id, role: 'partner', shop_id: shopId });
        }
      } else if (newRole !== 'partner' && previousRole === 'partner') {
        // Remove ALL partner role rows
        await supabase.from('user_roles').delete().eq('user_id', editingUser.user_id).eq('role', 'partner');
        if (newRole !== 'user') {
          await supabase.from('user_roles').insert({ user_id: editingUser.user_id, role: newRole, shop_id: null });
        }
      } else if (previousRole !== newRole) {
        if (previousRole !== 'user' && editingUser.role_id) {
          await supabase.from('user_roles').delete().eq('id', editingUser.role_id);
        }
        if (newRole !== 'user') {
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({ user_id: editingUser.user_id, role: newRole, shop_id: null });
          if (roleError) throw roleError;
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
        _source: 'admin',
      } as never);

      if (error) throw error;

      // Parse the response (it's a JSON object from the function)
      const result = data as { success: boolean; error?: string; cups_count?: number; expires_at?: string; subscription_id?: string; duration_days?: number; subscription_name?: string } | null;

      if (!result?.success) {
        throw new Error(result?.error || 'Unknown error');
      }

      // Update local form state with new values
      if (subType.type === 'coffee') {
        setFormData(prev => ({ 
          ...prev, 
          coffee_remaining: result.cups_count || subType.cups_count,
        }));
      } else {
        setFormData(prev => ({ 
          ...prev, 
          drinks_remaining: result.cups_count || subType.cups_count,
        }));
      }

      const expiresAt = result.expires_at ? new Date(result.expires_at) : new Date(Date.now() + subType.duration_days * 24 * 60 * 60 * 1000);
      const formattedDate = expiresAt.toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });

      // Send Telegram notification for subscription activation
      const durationDays = result.duration_days || subType.duration_days;
      supabase.functions.invoke('send-subscription-notification', {
        body: {
          type: 'activated',
          userId: editingUser.user_id,
          cupsCount: result.cups_count || subType.cups_count,
          daysCount: durationDays,
          subscriptionName: result.subscription_name || subType.name,
        },
      }).then(({ error: notifError }) => {
        if (notifError) {
          console.error('Failed to send notification:', notifError);
        } else {
          console.log('Subscription notification sent');
        }
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

  const handleResetSubscription = async (type: 'coffee' | 'drinks') => {
    if (!editingUser) return;
    try {
      // Deactivate subscriptions of this type
      const { data: subs } = await supabase
        .from('user_subscriptions')
        .select('id, subscription_types(type)')
        .eq('user_id', editingUser.user_id)
        .eq('is_active', true);

      for (const sub of (subs || [])) {
        const subType = sub.subscription_types as unknown as { type: string } | null;
        if (subType?.type === type) {
          await supabase.from('user_subscriptions').update({ is_active: false }).eq('id', sub.id);
        }
      }

      // Reset balance for this type
      if (type === 'coffee') {
        await supabase.from('user_stats').update({ coffee_remaining: 0, coffee_total: 0 }).eq('user_id', editingUser.user_id);
        setFormData(prev => ({ ...prev, coffee_remaining: 0 }));
      } else {
        await supabase.from('user_stats').update({ drinks_remaining: 0, drinks_total: 0 }).eq('user_id', editingUser.user_id);
        setFormData(prev => ({ ...prev, drinks_remaining: 0 }));
      }

      toast({ title: `Подписка ${type === 'coffee' ? 'Кофе' : 'Ланч'} обнулена` });
      fetchUsers();
    } catch (error) {
      console.error('Error resetting subscription:', error);
      toast({ title: 'Ошибка обнуления', variant: 'destructive' });
    }
  };

  const handleResetGuestCoffee = async () => {
    if (!editingUser) return;
    try {
      const { error } = await supabase
        .from('user_stats')
        .update({ guest_coffees: 0, guest_expires_at: null })
        .eq('user_id', editingUser.user_id);
      if (error) throw error;
      setEditingUser(prev => prev ? { ...prev, guest_coffees: 0, guest_expires_at: null } : prev);
      toast({ title: 'Гостевой кофе обнулён' });
      fetchUsers();
    } catch (error) {
      console.error('Error resetting guest coffee:', error);
      toast({ title: 'Ошибка обнуления', variant: 'destructive' });
    }
  };

  const handleResetDailyLimit = async (subId: string) => {
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ daily_limit_reset_at: new Date().toISOString() } as any)
        .eq('id', subId);
      if (error) throw error;
      toast({ title: 'Дневной лимит обновлён' });
      fetchUsers();
    } catch (error) {
      console.error('Error resetting daily limit:', error);
      toast({ title: 'Ошибка обновления лимита', variant: 'destructive' });
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
          <div className="flex flex-col gap-4">
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
            <div className="flex flex-wrap items-center gap-2">
              <CountryCityFilter
                countryFilter={countryFilter}
                cityFilter={cityFilter}
                onCountryChange={(v) => { setCountryFilter(v); setPage(0); }}
                onCityChange={(v) => { setCityFilter(v); setPage(0); }}
                countryClassName="w-44"
                cityClassName="w-44"
              />
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Регистрация:</span>
              {['all', 'week', 'month', 'custom'].map((filter) => (
                <Button
                  key={filter}
                  variant={registrationFilter === filter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setRegistrationFilter(filter);
                    setPage(0);
                  }}
                >
                  {filter === 'all' && 'Все'}
                  {filter === 'week' && 'За неделю'}
                  {filter === 'month' && 'За месяц'}
                  {filter === 'custom' && 'Произвольный'}
                </Button>
              ))}
              {registrationFilter === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => { setCustomDateFrom(e.target.value); setPage(0); }}
                    className="w-36 h-8 text-sm"
                    placeholder="От"
                  />
                  <span className="text-sm text-muted-foreground">—</span>
                  <Input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => { setCustomDateTo(e.target.value); setPage(0); }}
                    className="w-36 h-8 text-sm"
                    placeholder="До"
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Подписка:</span>
              {[
                { value: 'all', label: 'Все' },
                { value: 'has_subscription', label: 'Есть подписка' },
                { value: 'no_subscription', label: 'Нет подписки' },
                { value: 'frozen', label: 'Заморозка', icon: true },
              ].map((filter) => (
                <Button
                  key={filter.value}
                  variant={subscriptionFilter === filter.value ? 'default' : 'outline'}
                  size="sm"
                  className={filter.value === 'frozen' && subscriptionFilter !== 'frozen' ? 'text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900' : undefined}
                  onClick={() => {
                    setSubscriptionFilter(filter.value);
                    setPage(0);
                  }}
                >
                  {filter.icon && <Snowflake className="w-3.5 h-3.5 mr-1" />}
                  {filter.label}
                </Button>
              ))}
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
                      <TableHead>ID</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Регистрация</TableHead>
                      <TableHead>Страна</TableHead>
                      <TableHead>Город</TableHead>
                      <TableHead className="text-center">Кофе</TableHead>
                      <TableHead className="text-center">Ланч</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {user.public_id}
                        </TableCell>
                        <TableCell>
                          {user.phone.startsWith('+telegram_') ? 'TG' : user.phone}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-xs">{user.country ? (COUNTRY_LABELS[user.country] || user.country) : '—'}</TableCell>
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
                          {user.b2b_owner_of && (
                            <div className="flex items-center gap-1 mb-1" title={`Владелец B2B: ${user.b2b_owner_of}`}>
                              <Building2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate max-w-[120px]">B2B: {user.b2b_owner_of}</span>
                            </div>
                          )}
                          {user.b2b_seat && (
                            <div className="flex items-center gap-1 mb-1" title={`B2B-место от «${user.b2b_seat.account}»`}>
                              <Building2 className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                              <span className="text-xs text-teal-600 dark:text-teal-400 font-medium truncate max-w-[130px]">B2B-место · {user.b2b_seat.tier}</span>
                            </div>
                          )}
                          {user.is_blocked ? (
                            <span className="text-destructive text-sm">Заблокирован</span>
                          ) : (
                            <span className="text-green-600 text-sm">Активен</span>
                          )}
                          {(() => {
                            const now = new Date();
                            const frozen = [user.coffee_subscription, user.lunch_subscription].some(
                              s => s?.is_frozen && s.freeze_until && new Date(s.freeze_until) > now,
                            );
                            return frozen ? (
                              <div className="flex items-center gap-1 mt-1 text-sky-600 dark:text-sky-400">
                                <Snowflake className="w-3 h-3" />
                                <span className="text-xs font-medium">Заморозка</span>
                              </div>
                            ) : null;
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(canManage || isAdmin) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(user)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {canManage && (
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
                            )}
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
            {/* Profile fields — editable for SuperAdmin, read-only for Admin */}
            {(canManage || isAdmin) && (
              <>
                <div>
                  <Label htmlFor="name">Имя</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!canManage}
                    className={!canManage ? 'bg-muted' : ''}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Страна</Label>
                    {canManage ? (
                      <Select value={formData.country} onValueChange={(v) => {
                        const cities = getCitiesForCountry(v);
                        setFormData({ ...formData, country: v, city: cities[0] || '' });
                      }}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
                            <SelectItem key={code} value={code}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={COUNTRY_LABELS[formData.country] || formData.country} disabled className="mt-1 bg-muted" />
                    )}
                  </div>
                  <div>
                    <Label htmlFor="city">Город</Label>
                    {canManage ? (
                      <Select value={formData.city} onValueChange={(v) => setFormData({ ...formData, city: v })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите город" />
                        </SelectTrigger>
                        <SelectContent>
                          {getCitiesForCountry(formData.country).map(city => (
                            <SelectItem key={city} value={city}>{city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={formData.city || '—'} disabled className="mt-1 bg-muted" />
                    )}
                  </div>
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
                      disabled={!canManage}
                      className={!canManage ? 'bg-muted' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="drinks">Остаток ланчей</Label>
                    <Input
                      id="drinks"
                      type="number"
                      min="0"
                      value={formData.drinks_remaining}
                      onChange={(e) => setFormData({ ...formData, drinks_remaining: parseInt(e.target.value) || 0 })}
                      disabled={!canManage}
                      className={!canManage ? 'bg-muted' : ''}
                    />
                  </div>
                </div>
              </>
            )}

            <div className={canManage ? "border-t pt-4" : ""}>
              <Label>Роль пользователя</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
                  disabled={editingUser?.role === 'superadmin' && editingUser?.public_id === '773158'}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Пользователь</SelectItem>
                    {isSuperAdmin && <SelectItem value="superadmin">СуперАдмин</SelectItem>}
                    <SelectItem value="admin">Администратор</SelectItem>
                    <SelectItem value="moderator">Модератор</SelectItem>
                    <SelectItem value="partner">Партнёр</SelectItem>
                    <SelectItem value="barista">Бариста</SelectItem>
                  </SelectContent>
                </Select>
              {editingUser?.role === 'superadmin' && editingUser?.public_id === '773158' && (
                <p className="text-xs text-muted-foreground mt-1">🔒 Роль главного СуперАдмина защищена от изменений</p>
              )}
              
              {formData.role === 'partner' && (
                <div className="mt-3 space-y-2">
                  <Label>Привязка к кофейням</Label>

                  {/* Assigned shops list */}
                  {partnerShopIds.length > 0 ? (
                    <div className="space-y-1.5">
                      {partnerShopIds.map(shopId => {
                        const shop = shops.find(s => s.id === shopId);
                        return (
                          <div key={shopId} className="flex items-center justify-between px-3 py-2 bg-secondary rounded-xl">
                            <div className="flex items-center gap-2">
                              <Store size={14} className="text-primary shrink-0" />
                              <span className="text-sm font-medium">{shop?.name || shopId}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPartnerShopIds(ids => ids.filter(id => id !== shopId))}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Кофейни не привязаны</p>
                  )}

                  {/* Add shop selector */}
                  {shops.filter(s => !partnerShopIds.includes(s.id)).length > 0 && (
                    <Select onValueChange={(v) => setPartnerShopIds(ids => [...ids, v])}>
                      <SelectTrigger className="mt-1">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Plus size={14} />
                          <span>Добавить кофейню</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {shops.filter(s => !partnerShopIds.includes(s.id)).map(shop => (
                          <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {(canManage || isAdmin) && (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    id="subflow_access"
                    checked={formData.subflow_access}
                    onCheckedChange={(checked) => setFormData({ ...formData, subflow_access: checked })}
                    disabled={!canManage}
                  />
                  <Label htmlFor="subflow_access">#subFlow доступ</Label>
                </div>

                {isSuperAdmin && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ai_access"
                      checked={formData.ai_access}
                      onCheckedChange={(checked) => setFormData({ ...formData, ai_access: checked })}
                    />
                    <Label htmlFor="ai_access">AI</Label>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Switch
                    id="is_blocked"
                    checked={formData.is_blocked}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_blocked: checked })}
                    disabled={!canManage}
                  />
                  <Label htmlFor="is_blocked">Заблокирован</Label>
                </div>

                {/* Active subscriptions display */}
                {(editingUser?.coffee_subscription || editingUser?.lunch_subscription) && (
                  <div className="border-t pt-4 space-y-2">
                    <Label>Активные подписки</Label>
                    {editingUser?.coffee_subscription && (
                      <SubscriptionRow
                        sub={editingUser.coffee_subscription}
                        icon={<Coffee className="w-4 h-4 text-amber-600" />}
                        type="coffee"
                        canManage={canManage}
                        onReset={() => handleResetSubscription('coffee')}
                        onResetDailyLimit={() => handleResetDailyLimit(editingUser.coffee_subscription!.sub_id)}
                      />
                    )}
                    {editingUser?.lunch_subscription && (
                      <SubscriptionRow
                        sub={editingUser.lunch_subscription}
                        icon={<UtensilsCrossed className="w-4 h-4 text-purple-600" />}
                        type="drinks"
                        canManage={canManage}
                        onReset={() => handleResetSubscription('drinks')}
                        onResetDailyLimit={() => handleResetDailyLimit(editingUser.lunch_subscription!.sub_id)}
                      />
                    )}
                  </div>
                )}

                {/* Guest coffee balance */}
                {!!editingUser?.guest_coffees && editingUser.guest_coffees > 0 && (
                  <div className="border-t pt-4 space-y-2">
                    <Label>Гостевой кофе</Label>
                    <div className="bg-secondary/50 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-pink-600" />
                        <span className="text-sm font-medium">{editingUser.guest_coffees} шт.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatExpiryLabel(editingUser.guest_expires_at)}
                        </span>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={handleResetGuestCoffee}
                          >
                            Обнулить
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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
                            {sub.name} ({sub.cups_count} {sub.type === 'coffee' ? 'кофе' : 'ланчей'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddSubscription} disabled={!selectedSubscription}>
                      Добавить
                    </Button>
                  </div>
                </div>
              </>
            )}

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
