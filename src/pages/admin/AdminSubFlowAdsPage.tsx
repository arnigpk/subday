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
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Loader2, Eye, EyeOff, BarChart3, MousePointerClick, Heart, MessageCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { SubFlowAdForm } from '@/components/admin/SubFlowAdForm';
import { SubFlowAdsList } from '@/components/admin/SubFlowAdsList';
import { useAdminAuth } from '@/hooks/useAdminAuth';

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

interface AdAnalytics {
  [adId: string]: { views: number; clicks: number; reactions: number; comments: number };
}

const TABS = [
  { id: 'create', label: 'Создать рекламу' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'requests', label: 'Заявки' },
];

export default function AdminSubFlowAdsPage() {
  const { canManage } = useAdminAuth();
  const [activeTab, setActiveTab] = useState('create');
  const [ads, setAds] = useState<SubFlowAd[]>([]);
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [analytics, setAnalytics] = useState<AdAnalytics>({});
  const [isLoading, setIsLoading] = useState(true);
  const [editingAd, setEditingAd] = useState<SubFlowAd | null>(null);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('subflow_ads_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ads' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [adsRes, requestsRes, shopsRes] = await Promise.all([
      supabase.from('subflow_ads').select('*').order('created_at', { ascending: false }),
      supabase.from('ad_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('shops').select('id, name').eq('is_active', true).order('name'),
    ]);
    const adsData = (adsRes.data as any[]) || [];
    setAds(adsData);
    setRequests((requestsRes.data as any[]) || []);
    setShops(shopsRes.data || []);

    // Fetch analytics for all ads
    if (adsData.length > 0) {
      const adIds = adsData.map((a: any) => a.id);
      const [{ data: events }, { data: reactionsData }, { data: commentsData }] = await Promise.all([
        supabase.from('subflow_ad_events').select('ad_id, event_type').in('ad_id', adIds),
        supabase.from('subflow_ad_reactions' as any).select('ad_id').in('ad_id', adIds),
        supabase.from('subflow_ad_comments' as any).select('ad_id').in('ad_id', adIds),
      ]);

      const analyticsMap: AdAnalytics = {};
      adIds.forEach((id: string) => { analyticsMap[id] = { views: 0, clicks: 0, reactions: 0, comments: 0 }; });
      (events || []).forEach((e: any) => {
        if (analyticsMap[e.ad_id]) {
          if (e.event_type === 'view') analyticsMap[e.ad_id].views++;
          else if (e.event_type === 'click') analyticsMap[e.ad_id].clicks++;
        }
      });
      ((reactionsData as any[]) || []).forEach((r: any) => {
        if (analyticsMap[r.ad_id]) analyticsMap[r.ad_id].reactions++;
      });
      ((commentsData as any[]) || []).forEach((c: any) => {
        if (analyticsMap[c.ad_id]) analyticsMap[c.ad_id].comments++;
      });
      setAnalytics(analyticsMap);
    }

    setIsLoading(false);
  };

  const handleEdit = (ad: SubFlowAd) => {
    setEditingAd(ad);
    setActiveTab('create');
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

  const getCTR = (views: number, clicks: number) => {
    if (views === 0) return '0%';
    return ((clicks / views) * 100).toFixed(1) + '%';
  };

  return (
    <AdminLayout title="Реклама subFlow">
      <TabSwitcher tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

      {activeTab === 'create' && (
        <div className="space-y-6">
          {canManage && (
            <SubFlowAdForm
              shops={shops}
              editingAd={editingAd}
              onSaved={() => { setEditingAd(null); fetchData(); }}
              onCancel={() => setEditingAd(null)}
            />
          )}

          <SubFlowAdsList
            ads={ads}
            analytics={analytics}
            isLoading={isLoading}
            onEdit={canManage ? handleEdit : undefined}
            onDelete={canManage ? handleDelete : undefined}
            onToggleActive={canManage ? handleToggleActive : undefined}
            formatDate={formatDate}
          />
        </div>
      )}

      {activeTab === 'analytics' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 size={18} />
              Аналитика рекламы
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : ads.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет рекламных постов</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Реклама</TableHead>
                    <TableHead className="text-center">Просмотры</TableHead>
                    <TableHead className="text-center">Клики</TableHead>
                    <TableHead className="text-center">CTR</TableHead>
                    <TableHead className="text-center">Реакции</TableHead>
                    <TableHead className="text-center">Комменты</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ads.map(ad => {
                    const stats = analytics[ad.id] || { views: 0, clicks: 0, reactions: 0, comments: 0 };
                    return (
                      <TableRow key={ad.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {ad.image_url && <img src={ad.image_url} alt="" className="w-10 h-10 rounded object-cover" />}
                            <span className="text-sm font-medium line-clamp-1 max-w-[200px]">{ad.content}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Eye size={14} className="text-muted-foreground" />
                            <span className="font-semibold">{stats.views}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <MousePointerClick size={14} className="text-muted-foreground" />
                            <span className="font-semibold">{stats.clicks}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="font-semibold">
                            {getCTR(stats.views, stats.clicks)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Heart size={14} className="text-muted-foreground" />
                            <span className="font-semibold">{stats.reactions}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <MessageCircle size={14} className="text-muted-foreground" />
                            <span className="font-semibold">{stats.comments}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={ad.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {ad.is_active ? 'Активна' : 'Выкл'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
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
