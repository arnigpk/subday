import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Bell, Send, Zap, Heart, MessageCircle, UserPlus, FileText } from 'lucide-react';
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
  milestones: '',
  cooldown_minutes: 60,
};

const triggerLabels: Record<string, string> = {
  activated: 'Подписка активирована',
  low_balance: 'Низкий баланс',
  expiring_soon: 'Скоро истекает',
  custom: 'Кастомное',
  subflow_reaction: '#subFlow — Реакции',
  subflow_comment: '#subFlow — Комментарии',
  subflow_follow: '#subFlow — Подписчики',
  subflow_new_post: '#subFlow — Новый пост',
};

const channelLabels: Record<string, string> = {
  telegram: 'Telegram',
  push: 'Push',
  both: 'Telegram + Push',
};

const SUBFLOW_TRIGGERS = ['subflow_reaction', 'subflow_comment', 'subflow_follow', 'subflow_new_post'];

const defaultMilestones: Record<string, number[]> = {
  subflow_reaction: [3, 5, 10, 20, 50, 100],
  subflow_comment: [2, 5, 10, 20, 50, 100],
  subflow_follow: [2, 5, 10, 20, 50, 100],
};

const defaultMessages: Record<string, string> = {
  subflow_reaction: '🔥 Уже {{count}} реакций на ваш пост!\n«{{preview}}»',
  subflow_comment: '💬 Уже {{count}} комментариев к вашему посту:\n«{{preview}}»',
  subflow_follow: '👥 У вас уже {{count}} подписчиков! {{actor_name}} подписался на вас.',
  subflow_new_post: '📝 {{actor_name}} опубликовал(а) новый пост:\n«{{preview}}»',
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
    const config = t.trigger_config as any;
    setForm({
      name: t.name,
      trigger_type: t.trigger_type,
      channel: t.channel,
      message_template: t.message_template,
      is_active: t.is_active,
      threshold: config?.threshold || 0,
      milestones: config?.milestones ? config.milestones.join(', ') : '',
      cooldown_minutes: config?.cooldown_minutes || 60,
    });
    setDialogOpen(true);
  };

  const handleTriggerTypeChange = (v: string) => {
    const updates: any = { trigger_type: v };
    // Auto-fill defaults for subFlow triggers
    if (SUBFLOW_TRIGGERS.includes(v) && !editingTemplate) {
      updates.channel = 'both';
      updates.message_template = defaultMessages[v] || '';
      updates.milestones = defaultMilestones[v]?.join(', ') || '';
      if (!form.name) {
        updates.name = triggerLabels[v] || '';
      }
    }
    setForm(f => ({ ...f, ...updates }));
  };

  const handleSave = async () => {
    if (!form.name || !form.message_template) {
      toast.error('Заполните название и текст шаблона');
      return;
    }

    const triggerConfig: any = {};
    if (form.threshold) triggerConfig.threshold = form.threshold;
    if (form.milestones.trim()) {
      triggerConfig.milestones = form.milestones
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
    }

    const payload = {
      name: form.name,
      trigger_type: form.trigger_type,
      channel: form.channel,
      message_template: form.message_template,
      is_active: form.is_active,
      trigger_config: triggerConfig,
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

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'subflow_reaction': return <Heart className="w-4 h-4 text-red-500" />;
      case 'subflow_comment': return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'subflow_follow': return <UserPlus className="w-4 h-4 text-green-500" />;
      case 'subflow_new_post': return <FileText className="w-4 h-4 text-purple-500" />;
      default: return null;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'telegram': return <Send className="w-4 h-4 text-blue-500" />;
      case 'push': return <Bell className="w-4 h-4 text-amber-500" />;
      case 'both': return <Zap className="w-4 h-4 text-purple-500" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const isSubflowTrigger = (type: string) => SUBFLOW_TRIGGERS.includes(type);

  // Group templates
  const standardTemplates = templates.filter(t => !isSubflowTrigger(t.trigger_type));
  const subflowTemplates = templates.filter(t => isSubflowTrigger(t.trigger_type));

  return (
    <AdminLayout title="Автоматические уведомления">
      <div className="space-y-4">
        {/* Standard notifications */}
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
            ) : standardTemplates.length === 0 && subflowTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Нет шаблонов</p>
              </div>
            ) : (
              <div className="space-y-3">
                {standardTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                    getChannelIcon={getChannelIcon}
                    getTriggerIcon={getTriggerIcon}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SubFlow notifications section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg font-black">#subFlow</span>
              <span>Уведомления</span>
            </CardTitle>
            <CardDescription>
              Уведомления социальной ленты: реакции, комментарии, подписчики, новые посты.
              Пороги задают при каком количестве отправлять уведомление (например: 3, 5, 10).
              Переменные: {'{{count}}'}, {'{{actor_name}}'}, {'{{preview}}'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subflowTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm mb-3">Нет шаблонов #subFlow</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Добавьте шаблоны для уведомлений о реакциях, комментариях и подписках
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {subflowTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                    getChannelIcon={getChannelIcon}
                    getTriggerIcon={getTriggerIcon}
                  />
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
              <Select value={form.trigger_type} onValueChange={handleTriggerTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activated">Подписка активирована</SelectItem>
                  <SelectItem value="low_balance">Низкий баланс (напитки/ланчи)</SelectItem>
                  <SelectItem value="expiring_soon">Скоро истекает подписка</SelectItem>
                  <SelectItem value="custom">Кастомное</SelectItem>
                  <SelectItem value="subflow_reaction">#subFlow — Реакции</SelectItem>
                  <SelectItem value="subflow_comment">#subFlow — Комментарии</SelectItem>
                  <SelectItem value="subflow_follow">#subFlow — Подписчики</SelectItem>
                  <SelectItem value="subflow_new_post">#subFlow — Новый пост</SelectItem>
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
            {isSubflowTrigger(form.trigger_type) && form.trigger_type !== 'subflow_new_post' && (
              <div>
                <label className="text-sm font-medium mb-1 block">Пороги (milestones)</label>
                <Input
                  value={form.milestones}
                  onChange={e => setForm(f => ({ ...f, milestones: e.target.value }))}
                  placeholder="3, 5, 10, 20, 50, 100"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Уведомление отправляется только когда счётчик достигает одного из указанных значений. Через запятую.
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Текст уведомления</label>
              <Textarea
                value={form.message_template}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={4}
                placeholder={isSubflowTrigger(form.trigger_type) 
                  ? "Используйте {{count}}, {{actor_name}}, {{preview}}"
                  : "Используйте {{subscription_name}}, {{count}}, {{unit}}"
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isSubflowTrigger(form.trigger_type) 
                  ? 'Переменные: {{count}} — число, {{actor_name}} — имя, {{preview}} — превью поста'
                  : 'Переменные: {{subscription_name}} — название подписки, {{count}} — число, {{unit}} — единица'
                }
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

function TemplateCard({ template: t, onEdit, onDelete, onToggle, getChannelIcon, getTriggerIcon }: {
  template: NotificationTemplate;
  onEdit: (t: NotificationTemplate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, v: boolean) => void;
  getChannelIcon: (ch: string) => React.ReactNode;
  getTriggerIcon: (type: string) => React.ReactNode;
}) {
  const config = t.trigger_config as any;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {getTriggerIcon(t.trigger_type)}
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
            {config?.threshold && (
              <span className="px-2 py-1 bg-muted rounded-lg">
                Порог: {config.threshold}
              </span>
            )}
            {config?.milestones?.length > 0 && (
              <span className="px-2 py-1 bg-muted rounded-lg">
                Пороги: {config.milestones.join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={t.is_active} onCheckedChange={(v) => onToggle(t.id, v)} />
          <Button variant="ghost" size="icon" onClick={() => onEdit(t)}>
            <Pencil size={16} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(t.id)}>
            <Trash2 size={16} className="text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function isSubflowTrigger(type: string) {
  return SUBFLOW_TRIGGERS.includes(type);
}
