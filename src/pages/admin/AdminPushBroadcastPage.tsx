import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { PaperAirplaneIcon, BellIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';;
import { supabase } from '@/integrations/supabase/client';
import { BroadcastHistory } from '@/components/admin/BroadcastHistory';
import { AudienceTypeSelector, type AudienceType } from '@/components/admin/AudienceTypeSelector';
import { AudiencePreview } from '@/components/admin/AudiencePreview';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function AdminPushBroadcastPage() {
  const { canManage } = useAdminAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [audienceTypes, setAudienceTypes] = useState<AudienceType[]>(['all']);

  const handleSendPush = async () => {
    if (!title.trim()) {
      toast.error('Введите заголовок');
      return;
    }
    if (!message.trim()) {
      toast.error('Введите текст сообщения');
      return;
    }

    setIsLoading(true);

    try {
      const trimmedTitle = title.trim();
      const trimmedMessage = message.trim();

      const { data: fcmResult, error: fcmError } = await supabase.functions.invoke('send-fcm-push', {
        body: { title: trimmedTitle, message: trimmedMessage, audienceTypes },
      });

      if (fcmError) throw fcmError;
      if (!fcmResult?.success) {
        throw new Error(fcmResult?.error || 'Ошибка отправки PUSH');
      }

      if ((fcmResult?.recipient_count || 0) === 0) {
        toast.warning('Нет пользователей в выбранной аудитории');
      } else {
        toast.success(`Отправлено на ${fcmResult.recipient_count} пользователей`);
        if (fcmResult?.push_enabled === false) {
          toast.warning('FCM не настроен: уведомление отправлено только внутри приложения');
        } else if ((fcmResult?.failed || 0) > 0) {
          toast.warning(`Не удалось доставить на ${fcmResult.failed} устройств`);
        }
      }

      setTitle('');
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
              <BellIcon className="w-5 h-5" />
              Новое PUSH-уведомление
            </CardTitle>
            <CardDescription>
              Отправьте PUSH-уведомление всем пользователям приложения
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Заголовок (до 40 символов)</Label>
              <Input
                placeholder="Введите заголовок..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                Осталось: {40 - title.length}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Текст уведомления</Label>
              <Textarea
                placeholder="Введите текст уведомления..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="resize-none"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Максимум 200 символов. Осталось: {200 - message.length}
              </p>
            </div>

            <AudienceTypeSelector value={audienceTypes} onChange={setAudienceTypes} disabled={isLoading} />

            <AudiencePreview audienceTypes={audienceTypes} channel="push" />

            {canManage ? (
              <Button
                onClick={handleSendPush}
                disabled={isLoading || !title.trim() || !message.trim()}
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
                    Отправить PUSH всем
                  </>
                )}
              </Button>
            ) : (
              <div className="p-3 bg-muted rounded-lg border border-border text-center">
                <p className="text-sm text-muted-foreground">Только СуперАдмин может отправлять рассылки</p>
              </div>
            )}

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
              <ClockIcon className="w-5 h-5" />
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
