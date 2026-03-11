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
import { AudienceTypeSelector, type AudienceType } from '@/components/admin/AudienceTypeSelector';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function AdminPushBroadcastPage() {
  const { canManage } = useAdminAuth();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [audienceTypes, setAudienceTypes] = useState<AudienceType[]>(['all']);

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

      const trimmed = message.trim();
      const title = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;

      // 1) Create in-app PUSH notification (delivered via Lovable Cloud realtime)
      const { error: pushError } = await supabase
        .from('push_notifications')
        .insert({
          title,
          message: trimmed,
          created_by: user.id,
        });

      if (pushError) throw pushError;

      // 2) Save broadcast history record for admin UI
      const { error: historyError } = await supabase
        .from('broadcast_messages')
        .insert({
          message: trimmed,
          broadcast_type: 'push',
          target_type: audienceTypes.join(','),
          recipient_count: 0,
          sent_count: 0,
          failed_count: 0,
          sent_by: user.id,
        });

      if (historyError) throw historyError;

      toast.success('PUSH-уведомление отправлено');
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

            <AudienceTypeSelector value={audienceTypes} onChange={setAudienceTypes} disabled={isLoading} />

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

            <div className="p-3 bg-muted rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">
                Уведомление появится у активных пользователей в приложении.
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
