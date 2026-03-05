import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Bell, Send, Zap } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface NotificationTemplate {
  id: string;
  name: string;
  trigger_type: string;
  channel: string;
  message_template: string;
  is_active: boolean;
  trigger_config: any;
  created_at: string;
}

const defaultForm = {
  name: '',
  trigger_type: 'activated',
  channel: 'telegram',
  message_template: '',
  is_active: true,
  threshold: 0,
};

const triggerLabels: Record<string, string> = {
  activated: 'Подписка активирована',
  low_balance: 'Низкий баланс',
  expiring_soon: 'Скоро истекает',
  custom: 'Кастомное',
};

const channelLabels: Record<string, string> = {
  telegram: 'Telegram',
  push: 'Push',
  both: 'Telegram + Push',
};

export default function AdminAutoNotificationsPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('auto_notification_templates')
      .select('*')
      .order('trigger_type', { ascending: true });
    if (data) setTemplates(data as NotificationTemplate[]);
    if (error) console.error(error);
    setIsLoading(false);
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (t: NotificationTemplate) => {
    setEditingTemplate(t);
    setForm({
      name: t.name,
      trigger_type: t.trigger_type,
      channel: t.channel,
      message_template: t.message_template,
      is_active: t.is_active,
      threshold: (t.trigger_config as any)?.threshold || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.message_template) {
      toast.error('Заполните название и текст шаблона');
      return;
    }

    const payload = {
      name: form.name,
      trigger_type: form.trigger_type,
      channel: form.channel,
      message_template: form.message_template,
      is_active: form.is_active,
      trigger_config: form.threshold ? { threshold: form.threshold } : {},
    };

    if (editingTemplate) {
      const { error } = await supabase.from('auto_notification_templates').update(payload).eq('id', editingTemplate.id);
      if (error) { toast.error('Ошибка сохранения'); return; }
      toast.success('Шаблон обновлён');
    } else {
      const { error } = await supabase.from('auto_notification_templates').insert(payload);
      if (error) { toast.error('Ошибка создания'); return; }
      toast.success('Шаблон создан');
    }

    setDialogOpen(false);
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить шаблон?')) return;
    const { error } = await supabase.from('auto_notification_templates').delete().eq('id', id);
    if (error) { toast.error('Ошибка удаления'); return; }
    toast.success('Удалено');
    fetchTemplates();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from('auto_notification_templates').update({ is_active: isActive }).eq('id', id);
    fetchTemplates();
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'telegram': return <Send className="w-4 h-4 text-blue-500" />;
      case 'push': return <Bell className="w-4 h-4 text-amber-500" />;
      case 'both': return <Zap className="w-4 h-4 text-purple-500" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <AdminLayout title="Автоматические уведомления">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Шаблоны автоуведомлений</CardTitle>
            <CardDescription>
              Управляйте автоматическими уведомлениями которые отправляются при определённых событиях.
              Используйте переменные: {'{{subscription_name}}'}, {'{{count}}'}, {'{{unit}}'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={openCreate} className="gap-2 mb-4">
              <Plus size={16} /> Добавить шаблон
            </Button>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Нет шаблонов</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(t => (
                  <div key={t.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getChannelIcon(t.channel)}
                          <h3 className="font-bold text-foreground">{t.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground'}`}>
                            {t.is_active ? 'Активен' : 'Отключен'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 font-mono bg-muted/50 p-2 rounded">
                          {t.message_template}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="px-2 py-1 bg-muted rounded-lg">
                            Триггер: {triggerLabels[t.trigger_type] || t.trigger_type}
                          </span>
                          <span className="px-2 py-1 bg-muted rounded-lg">
                            Канал: {channelLabels[t.channel] || t.channel}
                          </span>
                          {(t.trigger_config as any)?.threshold && (
                            <span className="px-2 py-1 bg-muted rounded-lg">
                              Порог: {(t.trigger_config as any).threshold}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.is_active} onCheckedChange={(v) => handleToggle(t.id, v)} />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                          <Pencil size={16} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                          <Trash2 size={16} className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Название</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Например: Подписка активирована" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Тип триггера</label>
              <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activated">Подписка активирована</SelectItem>
                  <SelectItem value="low_balance">Низкий баланс (напитки/ланчи)</SelectItem>
                  <SelectItem value="expiring_soon">Скоро истекает подписка</SelectItem>
                  <SelectItem value="custom">Кастомное</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Канал отправки</label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="push">Push-уведомление</SelectItem>
                  <SelectItem value="both">Telegram + Push</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.trigger_type === 'low_balance' || form.trigger_type === 'expiring_soon') && (
              <div>
                <label className="text-sm font-medium mb-1 block">Порог (количество)</label>
                <Input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))} placeholder="Например: 5" />
                <p className="text-xs text-muted-foreground mt-1">
                  {form.trigger_type === 'low_balance' ? 'Уведомление при остатке ≤ этого числа напитков/ланчей' : 'Уведомление за N дней до окончания'}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Текст уведомления</label>
              <Textarea
                value={form.message_template}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={4}
                placeholder="Используйте {{subscription_name}}, {{count}}, {{unit}}"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Переменные: {'{{subscription_name}}'} — название подписки, {'{{count}}'} — число, {'{{unit}}'} — единица (напитков/дней/ланчей)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <span className="text-sm">Активен</span>
            </div>
            <Button onClick={handleSave} className="w-full">Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
