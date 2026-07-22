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
import { AudienceTypeSelector, type AudienceType, audienceOptions } from '@/components/admin/AudienceTypeSelector';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadWithProgress } from '@/utils/xhrUpload';
import { compressImage } from '@/utils/imageCompression';
import { Plus, Trash2, MessageSquare, Clock, Eye, EyeOff, Users, MousePointerClick, Loader2, X as XIcon, ImagePlus } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface AppMessage {
  id: string;
  content: string;
  title: string | null;
  media_type: string;
  emoji: string | null;
  image_url: string | null;
  button_label: string | null;
  button_action: string;
  button_value: string | null;
  audience_types: string[];
  frequency_type: string;
  daily_frequency: number;
  scheduled_at: string | null;
  ends_at: string | null;
  display_style: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface MessageAnalytics {
  totalViews: number;
  uniqueViews: number;
  dismissals: number;
}

const BUTTON_ACTIONS = [
  { value: 'dismiss', label: 'Просто закрыть' },
  { value: 'shop', label: 'Открыть кофейню' },
  { value: 'packages', label: 'Открыть тарифы' },
  { value: 'external', label: 'Внешняя ссылка' },
];

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, MessageAnalytics>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const { isSuperAdmin, session } = useAdminAuth();
  const { toast } = useToast();

  // ── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaType, setMediaType] = useState<'none' | 'emoji' | 'image'>('none');
  const [emoji, setEmoji] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [useButton, setUseButton] = useState(false);
  const [buttonLabel, setButtonLabel] = useState('');
  const [buttonAction, setButtonAction] = useState('dismiss');
  const [buttonValue, setButtonValue] = useState('');
  const [audienceTypes, setAudienceTypes] = useState<AudienceType[]>(['all']);
  const [frequencyType, setFrequencyType] = useState('once');
  const [dailyFrequency, setDailyFrequency] = useState(1);
  const [useSchedule, setUseSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [useEndDate, setUseEndDate] = useState(false);
  const [endsAt, setEndsAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchMessages();
    fetchShops();
    const channel = supabase
      .channel('app_messages_admin-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_messages' }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchShops = async () => {
    const { data } = await supabase.from('shops').select('id, name').eq('is_active', true).order('name');
    setShops((data as { id: string; name: string }[]) || []);
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('app_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const msgs = data as unknown as AppMessage[];
      setMessages(msgs);
      if (msgs.length > 0) fetchAnalytics(msgs.map(m => m.id));
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

  const handleImageUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { blob } = await compressImage(file, { maxWidth: 1080, quality: 0.8 });
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const { publicUrl } = await uploadWithProgress({
        bucket: 'app-assets',
        path: `messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
        blob,
        contentType: blob.type || 'image/jpeg',
      });
      setImageUrl(publicUrl);
      setMediaType('image');
    } catch (e) {
      toast({ title: 'Не удалось загрузить картинку', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!content.trim()) {
      toast({ title: 'Введите текст сообщения', variant: 'destructive' });
      return;
    }
    if (content.length > 250) {
      toast({ title: 'Максимум 250 символов в тексте', variant: 'destructive' });
      return;
    }
    if (mediaType === 'emoji' && !emoji.trim()) {
      toast({ title: 'Выберите эмодзи или смените тип на «Ничего»', variant: 'destructive' });
      return;
    }
    if (mediaType === 'image' && !imageUrl) {
      toast({ title: 'Загрузите картинку или смените тип', variant: 'destructive' });
      return;
    }
    if (useButton) {
      if (!buttonLabel.trim()) { toast({ title: 'Введите текст кнопки', variant: 'destructive' }); return; }
      if (buttonAction === 'shop' && !buttonValue) { toast({ title: 'Выберите кофейню для кнопки', variant: 'destructive' }); return; }
      if (buttonAction === 'external' && !buttonValue.trim()) { toast({ title: 'Введите ссылку для кнопки', variant: 'destructive' }); return; }
    }

    setIsSaving(true);
    const { error } = await supabase.from('app_messages').insert({
      title: title.trim() || null,
      content: content.trim(),
      media_type: mediaType,
      emoji: mediaType === 'emoji' ? emoji.trim() : null,
      image_url: mediaType === 'image' ? imageUrl : null,
      button_label: useButton ? buttonLabel.trim() : null,
      button_action: useButton ? buttonAction : 'dismiss',
      button_value: useButton && (buttonAction === 'shop' || buttonAction === 'external') ? buttonValue.trim() : null,
      audience_types: audienceTypes,
      frequency_type: frequencyType,
      daily_frequency: frequencyType === 'daily' ? dailyFrequency : 1,
      scheduled_at: useSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      ends_at: useEndDate && endsAt ? new Date(endsAt).toISOString() : null,
      display_style: 'modal',
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
    setTitle('');
    setContent('');
    setMediaType('none');
    setEmoji('');
    setImageUrl('');
    setUseButton(false);
    setButtonLabel('');
    setButtonAction('dismiss');
    setButtonValue('');
    setAudienceTypes(['all']);
    setFrequencyType('once');
    setDailyFrequency(1);
    setUseSchedule(false);
    setScheduledAt('');
    setUseEndDate(false);
    setEndsAt('');
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

  const getFrequencyLabel = (msg: AppMessage) =>
    msg.frequency_type === 'once' ? '1 раз (навсегда)' : `${msg.daily_frequency}× в день`;

  const getAudienceLabel = (types: string[]) =>
    types.includes('all') ? 'Все' : types.map(t => audienceOptions.find(o => o.value === t)?.label || t).join(', ');

  // ── Live preview ────────────────────────────────────────────────────────
  const Preview = () => (
    <div className="rounded-2xl bg-black/55 p-4 flex items-center justify-center min-h-[220px]">
      <div className="relative w-full max-w-[260px] rounded-3xl bg-card shadow-xl overflow-hidden">
        {mediaType === 'image' && imageUrl && (
          <div className="w-full aspect-[16/10] bg-muted overflow-hidden">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <button className="absolute top-2 right-2 p-1 rounded-full bg-black/30 text-white" aria-hidden>
          <XIcon className="w-3.5 h-3.5" />
        </button>
        <div className="px-4 pt-4 pb-4 flex flex-col items-center text-center">
          {mediaType === 'emoji' && emoji && (
            <div className="mb-3 w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center text-2xl leading-none">
              {emoji}
            </div>
          )}
          {title && <p className="text-base font-bold text-foreground mb-1 leading-snug">{title}</p>}
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
            {content || 'Текст сообщения появится здесь…'}
          </p>
          {useButton && buttonLabel ? (
            <div className="btn-accent mt-4 w-full h-9 rounded-xl font-semibold text-xs flex items-center justify-center">
              {buttonLabel}
            </div>
          ) : (
            <span className="mt-4 text-xs font-medium text-muted-foreground">Понятно</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout title="Сообщения">
      <div className="space-y-6">
        {isSuperAdmin && (
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" />
            Новое сообщение
          </Button>
        )}

        {showForm && isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Создать сообщение</CardTitle>
              <p className="text-sm text-muted-foreground">Окно по центру экрана. Справа — как увидит пользователь.</p>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* ── Настройки ── */}
                <div className="space-y-5">
                  {/* Содержание */}
                  <div className="space-y-3">
                    <div>
                      <Label>Заголовок (необязательно)</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Например: Новая кофейня рядом!" maxLength={60} />
                      <p className="text-[11px] text-muted-foreground mt-1 text-right">{title.length}/60</p>
                    </div>
                    <div>
                      <Label>Текст сообщения *</Label>
                      <Textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 250))} placeholder="Основной текст с эмодзи 🎉" maxLength={250} rows={3} />
                      <p className="text-[11px] text-muted-foreground mt-1 text-right">{content.length}/250</p>
                    </div>
                  </div>

                  {/* Медиа: эмодзи или картинка */}
                  <div className="space-y-2">
                    <Label>Иконка сообщения</Label>
                    <div className="flex gap-2">
                      {([['none', 'Ничего'], ['emoji', 'Эмодзи'], ['image', 'Картинка']] as const).map(([v, l]) => (
                        <Button key={v} type="button" size="sm" variant={mediaType === v ? 'default' : 'outline'} onClick={() => setMediaType(v)}>
                          {l}
                        </Button>
                      ))}
                    </div>
                    {mediaType === 'emoji' && (
                      <Input value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(0, 2).join(''))} placeholder="🎉 (1-2 эмодзи)" className="text-2xl w-28" />
                    )}
                    {mediaType === 'image' && (
                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-secondary text-sm">
                          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                          {isUploading ? 'Загрузка…' : 'Загрузить картинку'}
                          <input type="file" accept="image/*" className="hidden" disabled={isUploading}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
                        </label>
                        {imageUrl && (
                          <div className="relative w-40">
                            <img src={imageUrl} alt="" className="w-40 h-24 object-cover rounded-lg" />
                            <button type="button" onClick={() => setImageUrl('')} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5">
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Кнопка */}
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center gap-3">
                      <Switch checked={useButton} onCheckedChange={setUseButton} />
                      <Label>Кнопка действия</Label>
                    </div>
                    {useButton && (
                      <div className="space-y-2 pl-1">
                        <Input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value.slice(0, 30))} placeholder="Текст кнопки, напр. «Смотреть»" maxLength={30} />
                        <Select value={buttonAction} onValueChange={(v) => { setButtonAction(v); setButtonValue(''); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BUTTON_ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {buttonAction === 'shop' && (
                          <Select value={buttonValue} onValueChange={setButtonValue}>
                            <SelectTrigger><SelectValue placeholder="Выберите кофейню" /></SelectTrigger>
                            <SelectContent>
                              {shops.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {buttonAction === 'external' && (
                          <Input value={buttonValue} onChange={(e) => setButtonValue(e.target.value)} placeholder="https://…" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Аудитория */}
                  <AudienceTypeSelector value={audienceTypes} onChange={setAudienceTypes} />

                  {/* Частота */}
                  <div className="space-y-2">
                    <Label>Частота показа</Label>
                    <Select value={frequencyType} onValueChange={setFrequencyType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">1 раз за всё время</SelectItem>
                        <SelectItem value="daily">Несколько раз в день</SelectItem>
                      </SelectContent>
                    </Select>
                    {frequencyType === 'daily' && (
                      <Input type="number" min={1} max={10} value={dailyFrequency}
                        onChange={(e) => setDailyFrequency(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} />
                    )}
                  </div>

                  {/* Расписание */}
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center gap-3">
                      <Switch checked={useSchedule} onCheckedChange={setUseSchedule} />
                      <Label>Запланировать начало показа</Label>
                    </div>
                    {useSchedule && (
                      <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <Switch checked={useEndDate} onCheckedChange={setUseEndDate} />
                      <Label>Дата окончания показа</Label>
                    </div>
                    {useEndDate && (
                      <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleCreate} disabled={isSaving || isUploading}>
                      {isSaving ? 'Создаём…' : 'Создать сообщение'}
                    </Button>
                    <Button variant="outline" onClick={resetForm}>Отмена</Button>
                  </div>
                </div>

                {/* ── Предпросмотр ── */}
                <div className="md:sticky md:top-4 h-fit space-y-2">
                  <Label>Предпросмотр</Label>
                  <Preview />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages List */}
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Загрузка…</p>
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
                          <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                          <Badge variant={msg.is_active ? 'default' : 'secondary'}>
                            {msg.is_active ? 'Активно' : 'Неактивно'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {msg.display_style === 'modal' ? 'Окно' : 'Плашка'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{getFrequencyLabel(msg)}</Badge>
                        </div>
                        <div className="flex items-start gap-2">
                          {msg.media_type === 'emoji' && msg.emoji && <span className="text-xl leading-none">{msg.emoji}</span>}
                          {msg.media_type === 'image' && msg.image_url && (
                            <img src={msg.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                          )}
                          <div className="min-w-0">
                            {msg.title && <p className="text-sm font-semibold break-words">{msg.title}</p>}
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                        </div>
                        {msg.button_label && (
                          <p className="text-xs text-accent">Кнопка: «{msg.button_label}» → {BUTTON_ACTIONS.find(a => a.value === msg.button_action)?.label}</p>
                        )}

                        {stats && (
                          <div className="flex flex-wrap gap-3 text-xs">
                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400"><Eye className="w-3.5 h-3.5" />{stats.totalViews} просм.</span>
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Users className="w-3.5 h-3.5" />{stats.uniqueViews} уник.</span>
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><MousePointerClick className="w-3.5 h-3.5" />{stats.dismissals} закр.</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>👥 {getAudienceLabel(msg.audience_types)}</span>
                          {msg.scheduled_at && (
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />с {format(new Date(msg.scheduled_at), 'dd MMM HH:mm', { locale: ru })}</span>
                          )}
                          {msg.ends_at && (
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />до {format(new Date(msg.ends_at), 'dd MMM HH:mm', { locale: ru })}</span>
                          )}
                          <span>Создано: {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: ru })}</span>
                        </div>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => toggleActive(msg)} title={msg.is_active ? 'Деактивировать' : 'Активировать'}>
                            {msg.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMessage(msg.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
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
