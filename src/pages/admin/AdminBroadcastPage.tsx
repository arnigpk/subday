import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { Send, Users, User, Loader2, Search, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TelegramUser {
  id: string;
  phone: string;
  name: string | null;
}

export default function AdminBroadcastPage() {
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTelegramUsers();
  }, []);

  const fetchTelegramUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone, name')
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
      } else {
        toast.warning('Сообщения не отправлены');
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
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const filteredUsers = telegramUsers.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const telegramId = user.phone.replace('+telegram_', '');
    return (
      user.name?.toLowerCase().includes(query) ||
      telegramId.includes(query)
    );
  });

  const getTelegramUsername = (phone: string) => {
    return phone.replace('+telegram_', '@');
  };

  return (
    <AdminLayout title="Рассылка">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Message composer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
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
                    <Users className="w-4 h-4" />
                    Всем ({telegramUsers.length})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific" id="specific" />
                  <Label htmlFor="specific" className="flex items-center gap-2 cursor-pointer">
                    <User className="w-4 h-4" />
                    Выбранным {selectedUsers.length > 0 && `(${selectedUsers.length})`}
                  </Label>
                </div>
              </RadioGroup>
            </div>

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
                  <Send className="w-4 h-4 mr-2" />
                  Отправить рассылку
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* User selector */}
        <Card className={targetType === 'all' ? 'opacity-50' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Получатели
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
                {searchQuery ? 'Пользователи не найдены' : 'Нет пользователей с Telegram'}
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedUsers.includes(user.id)
                          ? 'bg-primary/10 border-primary'
                          : 'bg-card hover:bg-muted'
                      } ${targetType === 'all' ? 'pointer-events-none' : ''}`}
                      onClick={() => targetType === 'specific' && toggleUser(user.id)}
                    >
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
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
    </AdminLayout>
  );
}
