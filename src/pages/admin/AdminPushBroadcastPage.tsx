import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { Send, Bell, Loader2, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BroadcastHistory } from '@/components/admin/BroadcastHistory';

export default function AdminPushBroadcastPage() {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleSendPush = async () => {
    if (!message.trim()) {
      toast.error('Введите текст сообщения');
      return;
    }

    setIsLoading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Ошибка авторизации');
        return;
      }

      // Note: Real PUSH notifications would require a service worker and web push API
      // For now, we'll just save the broadcast record
      // In production, you'd integrate with Firebase Cloud Messaging or similar

      const { error } = await supabase
        .from('broadcast_messages')
        .insert({
          message: message.trim(),
          broadcast_type: 'push',
          target_type: 'all',
          recipient_count: 0,
          sent_count: 0,
          failed_count: 0,
          sent_by: user.id,
        });

      if (error) throw error;

      toast.info('PUSH-рассылка сохранена (требуется настройка сервера уведомлений)');
      setMessage('');
      setHistoryRefresh(prev => prev + 1);
    } catch (error) {
      console.error('Push broadcast error:', error);
      toast.error('Ошибка отправки');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminLayout title="Рассылка PUSH">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Message composer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Новое PUSH-уведомление
            </CardTitle>
            <CardDescription>
              Отправьте PUSH-уведомление всем пользователям приложения
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Текст уведомления</Label>
              <Textarea
                placeholder="Введите текст уведомления..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="resize-none"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Максимум 200 символов. Осталось: {200 - message.length}
              </p>
            </div>

            <Button
              onClick={handleSendPush}
              disabled={isLoading || !message.trim()}
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
                  Отправить PUSH всем
                </>
              )}
            </Button>

            <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                ⚠️ Для работы PUSH-уведомлений требуется настройка Firebase Cloud Messaging или аналогичного сервиса на сервере.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              История PUSH-рассылок
            </CardTitle>
            <CardDescription>
              Все отправленные PUSH-уведомления
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BroadcastHistory type="push" refreshTrigger={historyRefresh} />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
