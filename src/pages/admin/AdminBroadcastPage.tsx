import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { PaperAirplaneIcon, UserGroupIcon, UserIcon, MagnifyingGlassIcon, ChatBubbleLeftIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';;
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BroadcastHistory } from '@/components/admin/BroadcastHistory';
import { AudienceTypeSelector, type AudienceType } from '@/components/admin/AudienceTypeSelector';
import { AudiencePreview } from '@/components/admin/AudiencePreview';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface TelegramUser {
  id: string;
  phone: string;
  name: string | null;
  user_id: string;
}

export default function AdminBroadcastPage() {
  const { canManage } = useAdminAuth();
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [audienceTypes, setAudienceTypes] = useState<AudienceType[]>(['all']);

  // Audience filtering data
  const [activeSubUserIds, setActiveSubUserIds] = useState<Set<string>>(new Set());
  const [expiringSoonUserIds, setExpiringSoonUserIds] = useState<Set<string>>(new Set());
  const [newUserIds, setNewUserIds] = useState<Set<string>>(new Set());
  const [inactiveUserIds, setInactiveUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTelegramUsers();
    fetchAudienceData();
  }, []);

  const fetchTelegramUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone, name, user_id')
        .like('phone', '+telegram_%')
        .order('name');

      if (error) throw error;
      setTelegramUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Ошибка загрузки пользователей');
    } finally {
      setIsFetching(false);
    }
  };

  const fetchAudienceData = async () => {
    try {
      const now = new Date();
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [subsRes, expiringRes, newRes, recentActiveRes] = await Promise.all([
        supabase.from('user_subscriptions').select('user_id').eq('is_active', true),
        supabase.from('user_subscriptions').select('user_id').eq('is_active', true).lte('expires_at', fiveDaysLater).gte('expires_at', now.toISOString()),
        supabase.from('profiles').select('user_id').gte('created_at', sevenDaysAgo),
        supabase.from('redemptions').select('user_id').gte('redeemed_at', thirtyDaysAgo),
      ]);

      const activeSet = new Set((subsRes.data || []).map(r => r.user_id));
      setActiveSubUserIds(activeSet);
      setExpiringSoonUserIds(new Set((expiringRes.data || []).map(r => r.user_id)));
      setNewUserIds(new Set((newRes.data || []).map(r => r.user_id)));

      // Inactive = not in recent redemptions AND not in active subs
      const recentSet = new Set((recentActiveRes.data || []).map(r => r.user_id));
      const combinedActive = new Set([...recentSet, ...activeSet]);
      setInactiveUserIds(combinedActive); // store active set, filter will invert
    } catch (error) {
      console.error('Error fetching audience data:', error);
    }
  };

  const audienceFilteredUsers = useMemo(() => {
    if (audienceTypes.includes('all')) return telegramUsers;

    return telegramUsers.filter(user => {
      const uid = user.user_id;
      for (const t of audienceTypes) {
        if (t === 'subscribers' && activeSubUserIds.has(uid)) return true;
        if (t === 'no_subscription' && !activeSubUserIds.has(uid)) return true;
        if (t === 'expiring_soon' && expiringSoonUserIds.has(uid)) return true;
        if (t === 'new_users' && newUserIds.has(uid)) return true;
        if (t === 'inactive' && !inactiveUserIds.has(uid)) return true; // inactiveUserIds stores "active" users
      }
      return false;
    });
  }, [telegramUsers, audienceTypes, activeSubUserIds, expiringSoonUserIds, newUserIds, inactiveUserIds]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return audienceFilteredUsers;
    const query = searchQuery.toLowerCase();
    return audienceFilteredUsers.filter(user => {
      const telegramId = user.phone.replace('+telegram_', '');
      return user.name?.toLowerCase().includes(query) || telegramId.includes(query);
    });
  }, [audienceFilteredUsers, searchQuery]);

  const handleSendBroadcast = async () => {
    if (!message.trim()) {
      toast.error('Введите текст сообщения');
      return;
    }

    if (targetType === 'specific' && selectedUsers.length === 0) {
      toast.error('Выберите получателей');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('telegram-broadcast', {
        body: {
          message: message.trim(),
          targetType,
          audienceTypes,
          userIds: targetType === 'specific' ? selectedUsers : undefined,
        },
      });

      if (error) throw error;

      if (data.sent > 0) {
        toast.success(`Отправлено: ${data.sent} из ${data.total}`);
        if (data.failed > 0) {
          toast.warning(`Не удалось отправить: ${data.failed}`);
        }
        setMessage('');
        setSelectedUsers([]);
        setHistoryRefresh(prev => prev + 1);
      } else {
        toast.warning(data.message || 'Сообщения не отправлены');
      }
    } catch (error) {
      console.error('Broadcast error:', error);
      toast.error('Ошибка отправки рассылки');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.user_id));
    }
  };

  const getTelegramUsername = (phone: string) => {
    return phone.replace('+telegram_', '@');
  };

  return (
    <AdminLayout title="Рассылка Telegram">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Message composer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="w-5 h-5" />
                Новое сообщение
              </CardTitle>
              <CardDescription>
                Отправьте сообщение пользователям через Telegram бот
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Текст сообщения</Label>
                <Textarea
                  placeholder="Введите текст сообщения..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Поддерживается HTML разметка: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;
                </p>
              </div>

              <AudienceTypeSelector value={audienceTypes} onChange={setAudienceTypes} disabled={isLoading} />

              <AudiencePreview audienceTypes={audienceTypes} channel="telegram" />

              <div className="space-y-3">
                <Label>Кому отправить</Label>
                <RadioGroup
                  value={targetType}
                  onValueChange={(v) => setTargetType(v as 'all' | 'specific')}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="all" />
                    <Label htmlFor="all" className="flex items-center gap-2 cursor-pointer">
                      <UserGroupIcon className="w-4 h-4" />
                      Всем ({audienceFilteredUsers.length})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="specific" />
                    <Label htmlFor="specific" className="flex items-center gap-2 cursor-pointer">
                      <UserIcon className="w-4 h-4" />
                      Выбранным {selectedUsers.length > 0 && `(${selectedUsers.length})`}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {canManage ? (
                <Button
                  onClick={handleSendBroadcast}
                  disabled={isLoading || !message.trim() || (targetType === 'specific' && selectedUsers.length === 0)}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Отправка...
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="w-4 h-4 mr-2" />
                      Отправить рассылку
                    </>
                  )}
                </Button>
              ) : (
                <div className="p-3 bg-muted rounded-lg border border-border text-center">
                  <p className="text-sm text-muted-foreground">Только СуперАдмин может отправлять рассылки</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User selector */}
          <Card className={targetType === 'all' ? 'opacity-50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <UserGroupIcon className="w-5 h-5" />
                  Получатели ({filteredUsers.length})
                </span>
                {targetType === 'specific' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                  >
                    {selectedUsers.length === filteredUsers.length ? 'Снять всё' : 'Выбрать всех'}
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                Пользователи с Telegram аккаунтом
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  disabled={targetType === 'all'}
                />
              </div>

              {isFetching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'Пользователи не найдены' : 'Нет пользователей в выбранной аудитории'}
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.user_id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedUsers.includes(user.user_id)
                            ? 'bg-primary/10 border-primary'
                            : 'bg-card hover:bg-muted'
                        } ${targetType === 'all' ? 'pointer-events-none' : ''}`}
                        onClick={() => targetType === 'specific' && toggleUser(user.user_id)}
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.user_id)}
                          disabled={targetType === 'all'}
                          className="pointer-events-none"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {user.name || 'Без имени'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getTelegramUsername(user.phone)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* History section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="w-5 h-5" />
              История Telegram-рассылок
            </CardTitle>
            <CardDescription>
              Все отправленные сообщения через Telegram
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BroadcastHistory type="telegram" refreshTrigger={historyRefresh} />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
