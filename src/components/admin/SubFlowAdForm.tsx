import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { PlusIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { AudienceTypeSelector, type AudienceType } from '@/components/admin/AudienceTypeSelector';
import { COUNTRY_OPTIONS, getCitiesForCountry } from '@/utils/countries';

interface SubFlowAd {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
  frequency: number;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

interface Shop {
  id: string;
  name: string;
}

const LINK_TYPES = [
  { value: 'shop', label: 'Кофейня' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'external', label: 'Внешняя ссылка' },
];

const FREQUENCY_OPTIONS = [
  { value: 5, label: 'Каждые 5 постов' },
  { value: 10, label: 'Каждые 10 постов' },
  { value: 15, label: 'Каждые 15 постов' },
  { value: 20, label: 'Каждые 20 постов' },
  { value: 0, label: 'Кастомно' },
];

const DAILY_LIMIT_OPTIONS = [
  { value: 0, label: 'Без ограничений' },
  { value: 1, label: '1 раз в день' },
  { value: 2, label: '2 раза в день' },
  { value: 3, label: '3 раза в день' },
  { value: 5, label: '5 раз в день' },
  { value: -1, label: 'Кастомно' },
];

interface SubFlowAdFormProps {
  shops: Shop[];
  editingAd: SubFlowAd | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function SubFlowAdForm({ shops, editingAd, onSaved, onCancel }: SubFlowAdFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkType, setLinkType] = useState('shop');
  const [linkValue, setLinkValue] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [frequency, setFrequency] = useState(10);
  const [customFrequency, setCustomFrequency] = useState('');
  const [dailyLimit, setDailyLimit] = useState(0);
  const [customDailyLimit, setCustomDailyLimit] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [startsAt, setStartsAt] = useState<Date | undefined>(undefined);
  const [endsAt, setEndsAt] = useState<Date | undefined>(undefined);
  const [audienceTypes, setAudienceTypes] = useState<AudienceType[]>(['all']);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    if (editingAd) {
      setTitle(editingAd.title || '');
      setContent(editingAd.content);
      setImageUrl(editingAd.image_url || '');
      setLinkType(editingAd.link_type);
      setLinkValue(editingAd.link_value || '');
      setSelectedShopId(editingAd.shop_id || '');
      setIsActive(editingAd.is_active);
      setStartsAt(editingAd.starts_at ? new Date(editingAd.starts_at) : undefined);
      setEndsAt(editingAd.ends_at ? new Date(editingAd.ends_at) : undefined);
      setAudienceTypes((editingAd as any).audience_types?.length > 0 ? (editingAd as any).audience_types : ['all']);
      setCountry((editingAd as any).country || '');
      setCity((editingAd as any).city || '');

      const presetFreq = FREQUENCY_OPTIONS.find(f => f.value === editingAd.frequency && f.value !== 0);
      if (presetFreq) {
        setFrequency(editingAd.frequency);
        setCustomFrequency('');
      } else {
        setFrequency(0);
        setCustomFrequency(String(editingAd.frequency));
      }

      const presetDaily = DAILY_LIMIT_OPTIONS.find(d => d.value === editingAd.daily_limit && d.value !== -1);
      if (presetDaily) {
        setDailyLimit(editingAd.daily_limit);
        setCustomDailyLimit('');
      } else {
        setDailyLimit(-1);
        setCustomDailyLimit(String(editingAd.daily_limit));
      }
    } else {
      resetForm();
    }
  }, [editingAd]);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setImageUrl('');
    setLinkType('shop');
    setLinkValue('');
    setSelectedShopId('');
    setFrequency(10);
    setCustomFrequency('');
    setDailyLimit(0);
    setCustomDailyLimit('');
    setIsActive(true);
    setImageFile(null);
    setStartsAt(undefined);
    setEndsAt(undefined);
    setAudienceTypes(['all']);
    setCountry('');
    setCity('');
  };

  const handleImageUpload = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `subflow-ad-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ad-banners').upload(fileName, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('ad-banners').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Ошибка загрузки изображения');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Введите текст рекламы');
      return;
    }

    if (startsAt && endsAt && startsAt >= endsAt) {
      toast.error('Дата начала должна быть раньше даты окончания');
      return;
    }

    setIsSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        const uploaded = await handleImageUpload(imageFile);
        if (uploaded) finalImageUrl = uploaded;
        else { setIsSaving(false); return; }
      }

      const actualFrequency = frequency === 0 ? parseInt(customFrequency) || 10 : frequency;
      const actualDailyLimit = dailyLimit === -1 ? parseInt(customDailyLimit) || 0 : dailyLimit;
      const selectedShop = shops.find(s => s.id === selectedShopId);

      // Determine is_active based on scheduling
      let effectiveIsActive = isActive;
      const now = new Date();
      if (startsAt && startsAt > now) {
        effectiveIsActive = false; // Will be activated by the cron job
      }

      const adData: any = {
        title: title.trim() || null,
        content: content.trim(),
        image_url: finalImageUrl || null,
        link_type: linkType,
        link_value: linkType === 'shop' ? selectedShopId : linkValue || null,
        shop_id: linkType === 'shop' ? selectedShopId || null : null,
        shop_name: linkType === 'shop' ? selectedShop?.name || null : null,
        frequency: actualFrequency,
        daily_limit: actualDailyLimit,
        is_active: effectiveIsActive,
        starts_at: startsAt ? startsAt.toISOString() : null,
        ends_at: endsAt ? endsAt.toISOString() : null,
        audience_types: audienceTypes,
        country: country || null,
        city: city || null,
      };

      if (editingAd) {
        const { error } = await supabase.from('subflow_ads').update(adData).eq('id', editingAd.id);
        if (error) throw error;
        toast.success('Реклама обновлена');
      } else {
        const { error } = await supabase.from('subflow_ads').insert(adData);
        if (error) throw error;
        toast.success('Реклама создана');
      }

      resetForm();
      onSaved();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {editingAd ? 'Редактировать рекламу' : 'Новый рекламный пост'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Название</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название рекламодателя (отображается над меткой «реклама»)" />
        </div>

        <div>
          <Label>Текст рекламы *</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Текст рекламного поста..." rows={3} />
        </div>

        <div>
          <Label>Изображение (загрузить)</Label>
          <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
          {(imageUrl || editingAd?.image_url) && !imageFile && (
            <div className="mt-2">
              <img src={imageUrl || editingAd?.image_url || ''} alt="Preview" className="w-32 h-32 object-cover rounded-lg" />
            </div>
          )}
          {imageFile && (
            <div className="mt-2">
              <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-32 h-32 object-cover rounded-lg" />
            </div>
          )}
        </div>

        <div>
          <Label>Или URL изображения</Label>
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Тип ссылки</Label>
            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINK_TYPES.map(lt => (
                  <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {linkType === 'shop' ? (
            <div>
              <Label>Кофейня</Label>
              <Select value={selectedShopId} onValueChange={setSelectedShopId}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  {shops.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Ссылка</Label>
              <Input
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                placeholder={
                  linkType === 'instagram' ? 'https://instagram.com/...' :
                  linkType === 'whatsapp' ? 'https://wa.me/...' :
                  linkType === 'telegram' ? 'https://t.me/...' :
                  'https://...'
                }
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Частота в ленте</Label>
            <Select value={String(frequency)} onValueChange={(v) => setFrequency(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {frequency === 0 && (
            <div>
              <Label>Кастомное значение</Label>
              <Input type="number" min={1} value={customFrequency} onChange={(e) => setCustomFrequency(e.target.value)} placeholder="Через каждые N постов" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Лимит показов на пользователя/день</Label>
            <Select value={String(dailyLimit)} onValueChange={(v) => setDailyLimit(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAILY_LIMIT_OPTIONS.map(d => (
                  <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dailyLimit === -1 && (
            <div>
              <Label>Кастомный лимит</Label>
              <Input type="number" min={1} value={customDailyLimit} onChange={(e) => setCustomDailyLimit(e.target.value)} placeholder="Макс. показов в день" />
            </div>
          )}
        </div>

        {/* Scheduling dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Дата начала</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !startsAt && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startsAt ? format(startsAt, 'dd.MM.yyyy', { locale: ru }) : 'Не задана'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startsAt}
                  onSelect={setStartsAt}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {startsAt && (
              <button className="text-xs text-muted-foreground underline mt-1" onClick={() => setStartsAt(undefined)}>Сбросить</button>
            )}
          </div>

          <div>
            <Label>Дата окончания</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !endsAt && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endsAt ? format(endsAt, 'dd.MM.yyyy', { locale: ru }) : 'Не задана'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endsAt}
                  onSelect={setEndsAt}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {endsAt && (
              <button className="text-xs text-muted-foreground underline mt-1" onClick={() => setEndsAt(undefined)}>Сбросить</button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Если задать даты, реклама автоматически включится в дату начала и выключится по окончании.
        </p>

        {/* Country/City targeting */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Страна</Label>
            <Select value={country || 'all'} onValueChange={(v) => { setCountry(v === 'all' ? '' : v); setCity(''); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Все страны" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все страны</SelectItem>
                {COUNTRY_OPTIONS.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Город</Label>
            <Select value={city || 'all'} onValueChange={(v) => setCity(v === 'all' ? '' : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Все города" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все города</SelectItem>
                {country && getCitiesForCountry(country).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audience types */}
        <AudienceTypeSelector value={audienceTypes} onChange={setAudienceTypes} />

        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>Активна</Label>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving || isUploading}>
            {isSaving || isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlusIcon className="w-4 h-4 mr-2" />}
            {editingAd ? 'Сохранить' : 'Создать'}
          </Button>
          {editingAd && (
            <Button variant="outline" onClick={() => { resetForm(); onCancel(); }}>Отмена</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
