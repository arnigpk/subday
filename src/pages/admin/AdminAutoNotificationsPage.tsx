import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Bell, Send, Zap, Heart, MessageCircle, UserPlus, FileText, LogIn, CreditCard, Smartphone, Bot, Coffee } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
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
  in_app_enabled: true,
};

const triggerLabels: Record<string, string> = {
  activated: 'Подписка активирована',
  activated_special: 'Подписка активирована (спецпредложение)',
  low_balance: 'Низкий баланс',
  expiring_soon: 'Скоро истекает',
  custom: 'Кастомное',
  preorder_new: 'Новый предзаказ',
  subflow_reaction: '#subFlow — Реакции',
  subflow_comment: '#subFlow — Комментарии',
  subflow_follow: '#subFlow — Подписчики',
  subflow_new_post: '#subFlow — Новый пост',
  subflow_story_like: '#subFlow — Лайк на сториз',
  admin_login_sms: 'Вход через SMS',
  admin_register_sms: 'Регистрация через SMS',
  admin_login_whatsapp: 'Вход через WhatsApp',
  admin_register_whatsapp: 'Регистрация через WhatsApp',
  admin_login_miniapp: 'Вход через Mini App',
  admin_register_miniapp: 'Регистрация через Mini App',
  admin_login_telegram: 'Вход через Telegram Bot',
  admin_register_telegram: 'Регистрация через Telegram Bot',
  admin_payment: 'Новая оплата подписки',
  admin_payment_special: 'Оплата (спецпредложение)',
  guest_coffee: 'Подарок кофе от друга',
};

const channelLabels: Record<string, string> = {
  telegram: 'Telegram',
  push: 'Push',
  both: 'Telegram + Push',
};

const SUBFLOW_TRIGGERS = ['subflow_reaction', 'subflow_comment', 'subflow_follow', 'subflow_new_post', 'subflow_story_like'];
const PREORDER_TRIGGERS = ['preorder_new'];
const ADMIN_TRIGGERS = [
  'admin_login_sms', 'admin_register_sms',
  'admin_login_whatsapp', 'admin_register_whatsapp',
  'admin_login_miniapp', 'admin_register_miniapp',
  'admin_login_telegram', 'admin_register_telegram',
  'admin_payment', 'admin_payment_special',
];
const isPreorderTrigger = (type: string) => PREORDER_TRIGGERS.includes(type);

const defaultMilestones: Record<string, number[]> = {
  subflow_reaction: [3, 5, 10, 20, 50, 100],
  subflow_comment: [2, 5, 10, 20, 50, 100],
  subflow_follow: [2, 5, 10, 20, 50, 100],
};

const defaultMessages: Record<string, string> = {
  subflow_reaction: '🔥 У вас уже {{count}} реакций на ваших постах!',
  subflow_comment: '💬 У вас уже {{count}} комментариев на ваших постах!',
  subflow_follow: '👥 У вас уже {{count}} подписчиков! {{actor_name}} подписался на вас.',
  subflow_new_post: '📝 {{actor_name}} опубликовал(а) новый пост:\n«{{preview}}»',
  subflow_story_like: '❤️ {{actor_name}} понравилась ваша история',
  admin_login_sms: '🔑 Вход через SMS\n\n👤 Имя: {{name}}\n📞 Телефон: {{phone}}\n🕐 {{time}}',
  admin_register_sms: '🆕 Новая регистрация через SMS\n\n👤 Имя: {{name}}\n📞 Телефон: {{phone}}\n🕐 {{time}}',
  admin_login_whatsapp: '🔑 Вход через WhatsApp\n\n👤 Имя: {{name}}\n📞 Телефон: {{phone}}\n🕐 {{time}}',
  admin_register_whatsapp: '🆕 Новая регистрация через WhatsApp\n\n👤 Имя: {{name}}\n📞 Телефон: {{phone}}\n🕐 {{time}}',
  admin_login_miniapp: '🔑 Вход (Mini App)\n\n👤 Имя: {{name}}\n📱 Telegram: {{telegram}}\n🕐 {{time}}',
  admin_register_miniapp: '🆕 Новая регистрация (Mini App)\n\n👤 Имя: {{name}}\n📱 Telegram: {{telegram}}\n🕐 {{time}}',
  admin_login_telegram: '🔑 Вход через Telegram\n\n👤 Имя: {{name}}\n📱 Telegram: {{telegram}}\n🕐 {{time}}',
  admin_register_telegram: '🆕 Новая регистрация через Telegram\n\n👤 Имя: {{name}}\n📱 Telegram: {{telegram}}\n🕐 {{time}}',
  admin_payment: '🎉 Новая оплата подписки!\n\n👤 Имя: {{name}}\n📦 Подписка: {{subscription_name}}\n💰 Сумма: {{amount}} ₸\n🆔 Заказ: {{order_id}}',
  admin_payment_special: '🎉 Новая оплата подписки! (спецпредложение)\n\n👤 Имя: {{name}}\n📦 Подписка: {{subscription_name}}\n💰 Сумма: {{amount}} ₸\n🆔 Заказ: {{order_id}}',
  guest_coffee: 'Поздравляем, ваш друг подарил вам 1 кофе на 10 дней, попробуйте subday 💚',
  preorder_new: '☕ Новый предзаказ!\n\n🏪 Кофейня: {{shop_name}}\n☕ Напиток: {{coffee_name}}\n🧴 Сироп: {{syrup}}\n👤 Клиент: {{customer_name}}\n🕐 {{time}}',
};

const isSubflowTrigger = (type: string) => SUBFLOW_TRIGGERS.includes(type);
const isAdminTrigger = (type: string) => ADMIN_TRIGGERS.includes(type);
const isStaffTrigger = (type: string) => PREORDER_TRIGGERS.includes(type);

export default function AdminAutoNotificationsPage() {
  const { canManage } = useAdminAuth();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    fetchTemplates();

    const channel = supabase
      .channel('auto_notification_templates_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auto_notification_templates' },
        () => {
          fetchTemplates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      in_app_enabled: config?.in_app_enabled !== false,
    });
    setDialogOpen(true);
  };

  const handleTriggerTypeChange = (v: string) => {
    const updates: any = { trigger_type: v };
    if ((SUBFLOW_TRIGGERS.includes(v) || ADMIN_TRIGGERS.includes(v) || PREORDER_TRIGGERS.includes(v)) && !editingTemplate) {
      updates.message_template = defaultMessages[v] || '';
      if (!form.name) {
        updates.name = triggerLabels[v] || '';
      }
      if (SUBFLOW_TRIGGERS.includes(v)) {
        updates.channel = 'both';
        updates.milestones = defaultMilestones[v]?.join(', ') || '';
      }
      if (ADMIN_TRIGGERS.includes(v)) {
        updates.channel = 'telegram';
      }
      if (PREORDER_TRIGGERS.includes(v)) {
        updates.channel = 'both';
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
    if (isSubflowTrigger(form.trigger_type)) {
      triggerConfig.cooldown_minutes = form.cooldown_minutes || 60;
    }
    // in_app_enabled: персистим всегда — некоторые триггеры (preorder_new, subflow_*)
    // создают записи в колокольчике независимо от канала FCM/Telegram.
    triggerConfig.in_app_enabled = form.in_app_enabled;

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
      case 'subflow_story_like': return <Heart className="w-4 h-4 text-pink-500" />;
      case 'preorder_new': return <Coffee className="w-4 h-4 text-amber-600" />;
      case 'admin_login_sms':
      case 'admin_register_sms': return <Smartphone className="w-4 h-4 text-blue-500" />;
      case 'admin_login_whatsapp':
      case 'admin_register_whatsapp': return <MessageCircle className="w-4 h-4 text-green-500" />;
      case 'admin_login_miniapp':
      case 'admin_register_miniapp': return <Bot className="w-4 h-4 text-blue-400" />;
      case 'admin_login_telegram':
      case 'admin_register_telegram': return <Send className="w-4 h-4 text-sky-500" />;
      case 'admin_payment':
      case 'admin_payment_special': return <CreditCard className="w-4 h-4 text-emerald-500" />;
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

  // Group templates
  const standardTemplates = templates.filter(t => !isSubflowTrigger(t.trigger_type) && !isAdminTrigger(t.trigger_type));
  const subflowTemplates = templates.filter(t => isSubflowTrigger(t.trigger_type));
  const adminTemplates = templates.filter(t => isAdminTrigger(t.trigger_type));

  const getVariablesHelp = (triggerType: string) => {
    if (isAdminTrigger(triggerType)) {
      if (triggerType.includes('payment')) {
        return '{{name}} — имя, {{subscription_name}} — подписка, {{amount}} — сумма, {{order_id}} — заказ';
      }
      if (triggerType.includes('miniapp') || triggerType.includes('telegram')) {
        return '{{name}} — имя, {{telegram}} — username, {{time}} — время';
      }
      return '{{name}} — имя, {{phone}} — телефон, {{time}} — время';
    }
    if (isSubflowTrigger(triggerType)) {
      return '{{count}} — число, {{actor_name}} — имя, {{preview}} — превью поста';
    }
    if (isPreorderTrigger(triggerType)) {
      return '{{shop_name}} — кофейня, {{coffee_name}} — напиток, {{syrup}} — сироп, {{customer_name}} — клиент, {{time}} — время';
    }
    return '{{subscription_name}} — название подписки, {{count}} — число, {{unit}} — единица';
  };

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
            {canManage && (
              <Button onClick={openCreate} className="gap-2 mb-4">
                <Plus size={16} /> Добавить шаблон
              </Button>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : standardTemplates.length === 0 && subflowTemplates.length === 0 && adminTemplates.length === 0 ? (
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
                    canManage={canManage}
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
              Уведомления социальной ленты. Реакции и комментарии считаются глобально по всем постам пользователя.
              Пороги задают при каком общем количестве отправлять уведомление (например: 3, 5, 10).
              Переменные: {'{{count}}'}, {'{{actor_name}}'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subflowTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm mb-3">Нет шаблонов #subFlow</p>
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
                    canManage={canManage}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin bot notifications section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-sky-500" />
              <span>Уведомления админ-бота</span>
            </CardTitle>
            <CardDescription>
              Уведомления которые приходят в @subdaynotification_bot при входе, регистрации и оплатах.
              Переменные: {'{{name}}'}, {'{{phone}}'}, {'{{telegram}}'}, {'{{time}}'}, {'{{subscription_name}}'}, {'{{amount}}'}, {'{{order_id}}'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm mb-3">Нет шаблонов админ-бота</p>
              </div>
            ) : (
              <div className="space-y-3">
                {adminTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                    getChannelIcon={getChannelIcon}
                    getTriggerIcon={getTriggerIcon}
                    canManage={canManage}
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
                  <SelectItem value="activated_special">Подписка активирована (спецпредложение)</SelectItem>
                  <SelectItem value="low_balance">Низкий баланс (напитки/ланчи)</SelectItem>
                  <SelectItem value="expiring_soon">Скоро истекает подписка</SelectItem>
                  <SelectItem value="custom">Кастомное</SelectItem>
                  <SelectItem value="preorder_new">☕ Новый предзаказ</SelectItem>
                  <SelectItem value="subflow_reaction">#subFlow — Реакции</SelectItem>
                  <SelectItem value="subflow_comment">#subFlow — Комментарии</SelectItem>
                  <SelectItem value="subflow_follow">#subFlow — Подписчики</SelectItem>
                  <SelectItem value="subflow_new_post">#subFlow — Новый пост</SelectItem>
                  <SelectItem value="subflow_story_like">❤️ #subFlow — Лайк на сториз</SelectItem>
                  <SelectItem value="admin_login_sms">🔑 Вход через SMS</SelectItem>
                  <SelectItem value="admin_register_sms">🆕 Регистрация через SMS</SelectItem>
                  <SelectItem value="admin_login_whatsapp">🔑 Вход через WhatsApp</SelectItem>
                  <SelectItem value="admin_register_whatsapp">🆕 Регистрация через WhatsApp</SelectItem>
                  <SelectItem value="admin_login_miniapp">🔑 Вход через Mini App</SelectItem>
                  <SelectItem value="admin_register_miniapp">🆕 Регистрация через Mini App</SelectItem>
                  <SelectItem value="admin_login_telegram">🔑 Вход через Telegram Bot</SelectItem>
                  <SelectItem value="admin_register_telegram">🆕 Регистрация через Telegram Bot</SelectItem>
                  <SelectItem value="admin_payment">🎉 Оплата подписки</SelectItem>
                  <SelectItem value="admin_payment_special">🎉 Оплата (спецпредложение)</SelectItem>
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
                  Уведомление отправляется когда общее число реакций/комментариев на всех постах достигает порога. Через запятую.
                </p>
              </div>
            )}
            {isSubflowTrigger(form.trigger_type) && (
              <div>
                <label className="text-sm font-medium mb-1 block">Кулдаун (минуты)</label>
                <Input
                  type="number"
                  value={form.cooldown_minutes}
                  onChange={e => setForm(f => ({ ...f, cooldown_minutes: Number(e.target.value) || 60 }))}
                  placeholder="60"
                  min={1}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Минимальный интервал между уведомлениями одного типа для пользователя.
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Текст уведомления</label>
              <Textarea
                value={form.message_template}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={4}
                placeholder="Текст шаблона с переменными"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {getVariablesHelp(form.trigger_type)}
              </p>
            </div>
            {(form.channel === 'push' || form.channel === 'both' || isSubflowTrigger(form.trigger_type) || isPreorderTrigger(form.trigger_type)) && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <Switch
                  checked={form.in_app_enabled}
                  onCheckedChange={v => setForm(f => ({ ...f, in_app_enabled: v }))}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">In-app уведомление</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isSubflowTrigger(form.trigger_type)
                      ? 'Показывать в колокольчике #subFlow в приложении'
                      : 'Показывать в колокольчике уведомлений на главной'}
                    . FCM push и Telegram-сообщения отправляются независимо.
                  </p>
                </div>
              </div>
            )}
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

function TemplateCard({ template: t, onEdit, onDelete, onToggle, getChannelIcon, getTriggerIcon, canManage }: {
  template: NotificationTemplate;
  onEdit: (t: NotificationTemplate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, v: boolean) => void;
  getChannelIcon: (ch: string) => React.ReactNode;
  getTriggerIcon: (type: string) => React.ReactNode;
  canManage: boolean;
}) {
  const config = t.trigger_config as any;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {getTriggerIcon(t.trigger_type)}
            {getChannelIcon(t.channel)}
            <h3 className="font-bold text-foreground">{t.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground'}`}>
              {t.is_active ? 'Активен' : 'Отключен'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-2 font-mono bg-muted/50 p-2 rounded whitespace-pre-wrap break-words">
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
            {config?.cooldown_minutes && (
              <span className="px-2 py-1 bg-muted rounded-lg">
                Кулдаун: {config.cooldown_minutes} мин
              </span>
            )}
            {(t.channel === 'push' || t.channel === 'both') && (
              <span className={`px-2 py-1 rounded-lg ${config?.in_app_enabled === false ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                In-app: {config?.in_app_enabled === false ? 'выкл' : 'вкл'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Switch checked={t.is_active} onCheckedChange={(v) => onToggle(t.id, v)} />
              <Button variant="ghost" size="icon" onClick={() => onEdit(t)}>
                <Pencil size={16} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(t.id)}>
                <Trash2 size={16} className="text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}