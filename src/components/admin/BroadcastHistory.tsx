import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2, MessageSquare, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface BroadcastMessage {
  id: string;
  message: string;
  broadcast_type: string;
  target_type: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  recipients: { name: string; telegram_id?: string; user_id?: string }[] | null;
}

interface BroadcastHistoryProps {
  type: 'telegram' | 'push';
  refreshTrigger?: number;
}

const audienceLabels: Record<string, string> = {
  all: 'Все',
  subscribers: 'С подпиской',
  no_subscription: 'Без подписки',
  expiring_soon: '≤5 дней',
  new_users: 'Новые',
  inactive: 'Неактивные',
  specific: 'Выборочно',
};

function getAudienceLabel(targetType: string) {
  if (targetType.includes(',')) {
    return targetType.split(',').map(t => audienceLabels[t.trim()] || t.trim()).join(' + ');
  }
  return audienceLabels[targetType] || targetType;
}

export function BroadcastHistory({ type, refreshTrigger }: BroadcastHistoryProps) {
  const { canManage } = useAdminAuth();
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHistory();
  }, [type, refreshTrigger]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('broadcast_messages')
        .select('*')
        .eq('broadcast_type', type)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setMessages((data as any[]) || []);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error fetching broadcast history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map(m => m.id)));
    }
  };

  const deletePushNotificationsByBroadcastMessages = async (broadcastMsgs: BroadcastMessage[]) => {
    if (type !== 'push') return;

    for (const msg of broadcastMsgs) {
      const parts = msg.message.split('\n');
      const title = parts[0] || '';
      const message = parts.slice(1).join('\n') || '';

      if (title && message) {
        await supabase
          .from('push_notifications')
          .delete()
          .eq('title', title)
          .eq('message', message)
          .not('created_by', 'is', null);

        // Backward compatibility for old broadcast rows
        await supabase
          .from('push_notifications')
          .delete()
          .eq('title', title)
          .eq('message', message)
          .is('user_id', null);
      } else {
        await supabase
          .from('push_notifications')
          .delete()
          .eq('title', msg.message)
          .not('created_by', 'is', null);

        await supabase
          .from('push_notifications')
          .delete()
          .eq('title', msg.message)
          .is('user_id', null);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      const toDelete = messages.filter(m => selectedIds.has(m.id));

      // Delete from push_notifications first (sync with users)
      await deletePushNotificationsByBroadcastMessages(toDelete);

      // Delete from broadcast_messages
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('broadcast_messages')
        .delete()
        .in('id', ids);

      if (error) throw error;
      setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      toast.success(`Удалено записей: ${ids.length}`);
    } catch (error) {
      console.error('Error deleting selected broadcasts:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const msg = messages.find(m => m.id === id);
      if (msg) {
        await deletePushNotificationsByBroadcastMessages([msg]);
      }

      const { error } = await supabase
        .from('broadcast_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Запись удалена');
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleClearAll = async () => {
    try {
      // For push type, clear broadcast-created notifications (new targeted + old global format)
      if (type === 'push') {
        const { error: pushError } = await supabase
          .from('push_notifications')
          .delete()
          .not('created_by', 'is', null);

        if (pushError) {
          console.error('Error clearing push_notifications:', pushError);
        }
      }

      const { error } = await supabase
        .from('broadcast_messages')
        .delete()
        .eq('broadcast_type', type);

      if (error) throw error;

      setMessages([]);
      setSelectedIds(new Set());
      toast.success('История очищена');
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error('Ошибка очистки');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>История рассылок пуста</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          {canManage && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <Checkbox
                checked={selectedIds.size === messages.length && messages.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              Все
            </label>
          )}
          <span className="text-sm text-muted-foreground">
            Всего: {messages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canManage && selectedIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить выбранные?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Будет удалено записей: {selectedIds.size}.
                    {type === 'push' && ' Уведомления также исчезнут у всех пользователей приложения.'}
                    {' '}Это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSelected}>
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Очистить всё
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Очистить историю?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Все записи о рассылках будут удалены.
                    {type === 'push' && ' Уведомления также исчезнут у всех пользователей приложения.'}
                    {' '}Это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAll}>
                    Очистить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {messages.map((msg) => {
            const recipients = msg.recipients || [];
            const isExpanded = expandedId === msg.id;
            const isSelected = selectedIds.has(msg.id);

            return (
              <div key={msg.id} className={`p-4 rounded-lg border bg-card ${isSelected ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {canManage && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(msg.id)}
                        className="mt-1 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {type === 'telegram' ? (
                          <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
                        ) : (
                          <Bell className="w-4 h-4 text-orange-500 shrink-0" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), 'd MMM yyyy, HH:mm', { locale: ru })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                          {getAudienceLabel(msg.target_type)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-3 whitespace-pre-line">
                        {msg.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="text-green-600">
                          Отправлено: {msg.sent_count}
                        </span>
                        {msg.failed_count > 0 && (
                          <span className="text-red-600">
                            Ошибки: {msg.failed_count}
                          </span>
                        )}
                      </div>

                      {/* Recipients list */}
                      {recipients.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            Получатели ({recipients.length})
                          </button>
                          {isExpanded && (
                            <div className="mt-1.5 p-2 bg-muted rounded-md max-h-[150px] overflow-y-auto">
                              <div className="flex flex-wrap gap-1">
                                {recipients.map((r, i) => (
                                  <span key={i} className="text-xs bg-background px-2 py-0.5 rounded border">
                                    {r.name || (r.telegram_id ? `@${r.telegram_id}` : 'Без имени')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => handleDelete(msg.id)}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
