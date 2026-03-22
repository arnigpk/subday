import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AudienceTypeSelector, type AudienceType } from '@/components/admin/AudienceTypeSelector';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useToast } from '@/hooks/use-toast';
import { PlusIcon, TrashIcon, ChatBubbleLeftIcon, ClockIcon, EyeIcon, EyeSlashIcon, ChartBarIcon, UserGroupIcon, CursorArrowRippleIcon } from '@heroicons/react/24/outline';;
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { audienceOptions } from '@/components/admin/AudienceTypeSelector';

interface AppMessage {
  id: string;
  content: string;
  audience_types: string[];
  frequency_type: string;
  daily_frequency: number;
  scheduled_at: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface MessageAnalytics {
  totalViews: number;
  uniqueViews: number;
  dismissals: number;
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, MessageAnalytics>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { canManage, isSuperAdmin, session } = useAdminAuth();
  const { toast } = useToast();

  // Form state
  const [content, setContent] = useState('');
  const [audienceTypes, setAudienceTypes] = useState<AudienceType[]>(['all']);
  const [frequencyType, setFrequencyType] = useState('once');
  const [dailyFrequency, setDailyFrequency] = useState(1);
  const [useSchedule, setUseSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchMessages();
    const channel = supabase
      .channel('app_messages_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_messages' }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('app_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const msgs = data as AppMessage[];
      setMessages(msgs);
      if (msgs.length > 0) {
        fetchAnalytics(msgs.map(m => m.id));
      }
    }
    setIsLoading(false);
  };

  const fetchAnalytics = async (messageIds: string[]) => {
    const [viewsRes, uniqueRes, dismissRes] = await Promise.all([
      supabase.from('app_message_views').select('message_id').in('message_id', messageIds),
      supabase.from('app_message_unique_views').select('message_id').in('message_id', messageIds),
      supabase.from('app_message_dismissals').select('message_id').in('message_id', messageIds),
    ]);

    const result: Record<string, MessageAnalytics> = {};
    for (const id of messageIds) {
      result[id] = {
        totalViews: (viewsRes.data || []).filter(v => v.message_id === id).length,
        uniqueViews: (uniqueRes.data || []).filter(v => v.message_id === id).length,
        dismissals: (dismissRes.data || []).filter(d => d.message_id === id).length,
      };
    }
    setAnalytics(result);
  };

  const handleCreate = async () => {
    if (!content.trim()) {
      toast({ title: 'Введите текст сообщения', variant: 'destructive' });
      return;
    }
    if (content.length > 250) {
      toast({ title: 'Максимум 250 символов', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from('app_messages').insert({
      content: content.trim(),
      audience_types: audienceTypes,
      frequency_type: frequencyType,
      daily_frequency: frequencyType === 'daily' ? dailyFrequency : 1,
      scheduled_at: useSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      is_active: true,
      created_by: session?.user?.id || '',
    });
    if (error) {
      toast({ title: 'Ошибка создания', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Сообщение создано' });
      resetForm();
    }
    setIsSaving(false);
  };

  const resetForm = () => {
    setContent('');
    setAudienceTypes(['all']);
    setFrequencyType('once');
    setDailyFrequency(1);
    setUseSchedule(false);
    setScheduledAt('');
    setShowForm(false);
  };

  const toggleActive = async (msg: AppMessage) => {
    await supabase.from('app_messages').update({ is_active: !msg.is_active }).eq('id', msg.id);
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('Удалить сообщение?')) return;
    await supabase.from('app_messages').delete().eq('id', id);
    toast({ title: 'Сообщение удалено' });
  };

  const getFrequencyLabel = (msg: AppMessage) => {
    if (msg.frequency_type === 'once') return '1 раз (навсегда)';
    return `${msg.daily_frequency}× в день`;
  };

  const getAudienceLabel = (types: string[]) => {
    if (types.includes('all')) return 'Все';
    return types.map(t => audienceOptions.find(o => o.value === t)?.label || t).join(', ');
  };

  return (
    <AdminLayout title="Сообщения">
      <div className="space-y-6">
        {/* Only superadmin can create messages */}
        {isSuperAdmin && (
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <PlusIcon className="w-4 h-4" />
            Новое сообщение
          </Button>
        )}

        {showForm && isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Создать сообщение</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Текст сообщения (макс. 250 символов)</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value.slice(0, 250))}
                  placeholder="Введите текст сообщения с эмодзи 🎉"
                  maxLength={250}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground text-right">{content.length}/250</p>
              </div>

              <AudienceTypeSelector value={audienceTypes} onChange={setAudienceTypes} />

              <div className="space-y-2">
                <Label>Частотность показа</Label>
                <Select value={frequencyType} onValueChange={setFrequencyType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">1 раз за всё время</SelectItem>
                    <SelectItem value="daily">Несколько раз в день</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {frequencyType === 'daily' && (
                <div className="space-y-2">
                  <Label>Сколько раз в день</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={dailyFrequency}
                    onChange={(e) => setDailyFrequency(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch checked={useSchedule} onCheckedChange={setUseSchedule} />
                <Label>Запланировать время отправки</Label>
              </div>

              {useSchedule && (
                <div className="space-y-2">
                  <Label>Дата и время начала показа</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreate} disabled={isSaving}>
                  {isSaving ? 'Создаём...' : 'Создать сообщение'}
                </Button>
                <Button variant="outline" onClick={resetForm}>Отмена</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages List */}
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Загрузка...</p>
          ) : messages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Нет сообщений</p>
          ) : (
            messages.map((msg) => {
              const stats = analytics[msg.id];
              return (
                <Card key={msg.id} className={!msg.is_active ? 'opacity-60' : ''}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ChatBubbleLeftIcon className="w-4 h-4 text-primary shrink-0" />
                          <Badge variant={msg.is_active ? 'default' : 'secondary'}>
                            {msg.is_active ? 'Активно' : 'Неактивно'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getFrequencyLabel(msg)}
                          </Badge>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        
                        {/* Analytics row */}
                        {stats && (
                          <div className="flex flex-wrap gap-3 text-xs">
                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <EyeIcon className="w-3.5 h-3.5" />
                              {stats.totalViews} просм.
                            </span>
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <UserGroupIcon className="w-3.5 h-3.5" />
                              {stats.uniqueViews} уник.
                            </span>
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <CursorArrowRippleIcon className="w-3.5 h-3.5" />
                              {stats.dismissals} закр.
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>👥 {getAudienceLabel(msg.audience_types)}</span>
                          {msg.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <ClockIcon className="w-3 h-3" />
                              {format(new Date(msg.scheduled_at), 'dd MMM yyyy HH:mm', { locale: ru })}
                            </span>
                          )}
                          <span>
                            Создано: {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                          </span>
                        </div>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleActive(msg)}
                            title={msg.is_active ? 'Деактивировать' : 'Активировать'}
                          >
                            {msg.is_active ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMessage(msg.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
