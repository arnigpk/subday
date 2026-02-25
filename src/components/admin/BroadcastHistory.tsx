import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2, MessageSquare, Bell, Users, User } from 'lucide-react';
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

interface BroadcastMessage {
  id: string;
  message: string;
  broadcast_type: string;
  target_type: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
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
  return audienceLabels[targetType] || targetType;
}

export function BroadcastHistory({ type, refreshTrigger }: BroadcastHistoryProps) {
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching broadcast history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('broadcast_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setMessages(prev => prev.filter(m => m.id !== id));
      toast.success('Запись удалена');
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleClearAll = async () => {
    try {
      const { error } = await supabase
        .from('broadcast_messages')
        .delete()
        .eq('broadcast_type', type);

      if (error) throw error;
      
      setMessages([]);
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
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Всего: {messages.length}
        </span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Очистить историю
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Очистить историю?</AlertDialogTitle>
              <AlertDialogDescription>
                Все записи о рассылках будут удалены. Это действие нельзя отменить.
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
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="p-4 rounded-lg border bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {type === 'telegram' ? (
                      <MessageSquare className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Bell className="w-4 h-4 text-orange-500" />
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
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => handleDelete(msg.id)}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
