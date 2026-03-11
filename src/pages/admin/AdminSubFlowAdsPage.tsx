import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface SubFlowAd {
  id: string;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
  frequency: number;
  is_active: boolean;
  created_at: string;
}

interface AdRequest {
  id: string;
  shop_id: string | null;
  shop_name: string;
  partner_user_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface Shop {
  id: string;
  name: string;
}

const TABS = [
  { id: 'create', label: 'Создать рекламу' },
  { id: 'requests', label: 'Заявки' },
];

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

export default function AdminSubFlowAdsPage() {
  const [activeTab, setActiveTab] = useState('create');
  const [ads, setAds] = useState<SubFlowAd[]>([]);
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAd, setEditingAd] = useState<SubFlowAd | null>(null);

  // Form state
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkType, setLinkType] = useState('shop');
  const [linkValue, setLinkValue] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [frequency, setFrequency] = useState(10);
  const [customFrequency, setCustomFrequency] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [adsRes, requestsRes, shopsRes] = await Promise.all([
      supabase.from('subflow_ads').select('*').order('created_at', { ascending: false }),
      supabase.from('ad_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('shops').select('id, name').eq('is_active', true).order('name'),
    ]);
    setAds((adsRes.data as any[]) || []);
    setRequests((requestsRes.data as any[]) || []);
    setShops(shopsRes.data || []);
    setIsLoading(false);
  };

  const resetForm = () => {
    setContent('');
    setImageUrl('');
    setLinkType('shop');
    setLinkValue('');
    setSelectedShopId('');
    setFrequency(10);
    setCustomFrequency('');
    setIsActive(true);
    setEditingAd(null);
    setImageFile(null);
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

    setIsSaving(true);
    try {
      let finalImageUrl = imageUrl;

      // Upload image if file selected
      if (imageFile) {
        const uploaded = await handleImageUpload(imageFile);
        if (uploaded) finalImageUrl = uploaded;
        else { setIsSaving(false); return; }
      }

      const actualFrequency = frequency === 0 ? parseInt(customFrequency) || 10 : frequency;
      const selectedShop = shops.find(s => s.id === selectedShopId);

      const adData: any = {
        content: content.trim(),
        image_url: finalImageUrl || null,
        link_type: linkType,
        link_value: linkType === 'shop' ? selectedShopId : linkValue || null,
        shop_id: linkType === 'shop' ? selectedShopId || null : null,
        shop_name: linkType === 'shop' ? selectedShop?.name || null : null,
        frequency: actualFrequency,
        is_active: isActive,
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
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (ad: SubFlowAd) => {
    setEditingAd(ad);
    setContent(ad.content);
    setImageUrl(ad.image_url || '');
    setLinkType(ad.link_type);
    setLinkValue(ad.link_value || '');
    setSelectedShopId(ad.shop_id || '');
    setIsActive(ad.is_active);
    const presetFreq = FREQUENCY_OPTIONS.find(f => f.value === ad.frequency && f.value !== 0);
    if (presetFreq) {
      setFrequency(ad.frequency);
      setCustomFrequency('');
    } else {
      setFrequency(0);
      setCustomFrequency(String(ad.frequency));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('subflow_ads').delete().eq('id', id);
    if (error) { toast.error('Ошибка удаления'); return; }
    toast.success('Реклама удалена');
    fetchData();
  };

  const handleToggleActive = async (ad: SubFlowAd) => {
    const { error } = await supabase.from('subflow_ads').update({ is_active: !ad.is_active }).eq('id', ad.id);
    if (error) { toast.error('Ошибка'); return; }
    fetchData();
  };

  const handleUpdateRequestStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('ad_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Ошибка'); return; }
    toast.success(`Статус обновлен: ${status === 'approved' ? 'Одобрено' : status === 'rejected' ? 'Отклонено' : 'В ожидании'}`);
    fetchData();
  };

  const formatDate = (d: string) => {
    try { return format(parseISO(d), 'd MMM yyyy, HH:mm', { locale: ru }); } catch { return d; }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-800">Одобрено</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-800">Отклонено</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800">В ожидании</Badge>;
    }
  };

  return (
    <AdminLayout title="Реклама subFlow">
      <TabSwitcher tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Create/Edit form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editingAd ? 'Редактировать рекламу' : 'Новый рекламный пост'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Текст рекламы *</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Текст рекламного поста..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Изображение (загрузить)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
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
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
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
                  <Label>Частота показа</Label>
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
                    <Input
                      type="number"
                      min={1}
                      value={customFrequency}
                      onChange={(e) => setCustomFrequency(e.target.value)}
                      placeholder="Через каждые N постов"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Активна</Label>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={isSaving || isUploading}>
                  {isSaving || isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  {editingAd ? 'Сохранить' : 'Создать'}
                </Button>
                {editingAd && (
                  <Button variant="outline" onClick={resetForm}>Отмена</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ads list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Рекламные посты ({ads.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : ads.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Нет рекламных постов</p>
              ) : (
                <div className="space-y-3">
                  {ads.map(ad => (
                    <div key={ad.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/30">
                      {ad.image_url && (
                        <img src={ad.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-2">{ad.content}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {LINK_TYPES.find(lt => lt.value === ad.link_type)?.label || ad.link_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Каждые {ad.frequency} постов</span>
                          <Badge className={ad.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {ad.is_active ? 'Активна' : 'Выкл'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(ad.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleToggleActive(ad)} className="p-2 rounded-full hover:bg-muted transition-colors">
                          {ad.is_active ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}
                        </button>
                        <button onClick={() => handleEdit(ad)} className="p-2 rounded-full hover:bg-muted transition-colors">
                          <Pencil size={16} className="text-muted-foreground" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-2 rounded-full hover:bg-destructive/10 transition-colors">
                              <Trash2 size={16} className="text-destructive" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить рекламу?</AlertDialogTitle>
                              <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(ad.id)}>Удалить</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'requests' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Заявки на рекламу ({requests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : requests.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет заявок</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Кофейня</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.shop_name}</TableCell>
                      <TableCell className="text-sm">{formatDate(req.created_at)}</TableCell>
                      <TableCell>{statusBadge(req.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {req.status !== 'approved' && (
                            <Button size="sm" variant="outline" className="text-green-600 h-7 text-xs" onClick={() => handleUpdateRequestStatus(req.id, 'approved')}>
                              Одобрить
                            </Button>
                          )}
                          {req.status !== 'rejected' && (
                            <Button size="sm" variant="outline" className="text-red-600 h-7 text-xs" onClick={() => handleUpdateRequestStatus(req.id, 'rejected')}>
                              Отклонить
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </AdminLayout>
  );
}
