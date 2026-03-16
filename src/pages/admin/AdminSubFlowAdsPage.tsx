import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Loader2, Eye, EyeOff, BarChart3, MousePointerClick, Heart, MessageCircle, CalendarIcon, TrendingUp } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SubFlowAdForm } from '@/components/admin/SubFlowAdForm';
import { SubFlowAdsList } from '@/components/admin/SubFlowAdsList';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import { getCountryFlag } from '@/utils/countries';

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
  const [analyticsDateRange, setAnalyticsDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [analyticsCalendarOpen, setAnalyticsCalendarOpen] = useState(false);

  const analyticsRange = useMemo(() => ({
    from: analyticsDateRange.from ? startOfDay(analyticsDateRange.from).toISOString() : null,
    to: analyticsDateRange.to ? endOfDay(analyticsDateRange.to).toISOString() : null,
  }), [analyticsDateRange]);

  const fetchData = useCallback(async (fromDate: string | null, toDate: string | null) => {
    setIsLoading(true);

    try {
      const [adsRes, requestsRes, shopsRes, analyticsRes] = await Promise.all([
        supabase.from('subflow_ads').select('*').order('created_at', { ascending: false }),
        supabase.from('ad_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('shops').select('id, name').eq('is_active', true).order('name'),
        supabase.rpc('get_subflow_ad_analytics' as any, { _shop_id: null, _from: fromDate, _to: toDate }),
      ]);

      if (adsRes.error) throw adsRes.error;
      if (requestsRes.error) throw requestsRes.error;
      if (shopsRes.error) throw shopsRes.error;
      if (analyticsRes.error) throw analyticsRes.error;

      const adsData = (adsRes.data as SubFlowAd[]) || [];
      setAds(adsData);
      setRequests((requestsRes.data as AdRequest[]) || []);
      setShops((shopsRes.data as Shop[]) || []);

      const analyticsMap: AdAnalytics = {};
      adsData.forEach((ad) => {
        analyticsMap[ad.id] = { views: 0, clicks: 0, reactions: 0, comments: 0 };
      });

      ((analyticsRes.data as any[]) || []).forEach((item) => {
        if (!analyticsMap[item.ad_id]) {
          analyticsMap[item.ad_id] = { views: 0, clicks: 0, reactions: 0, comments: 0 };
        }

        analyticsMap[item.ad_id] = {
          views: Number(item.views ?? 0),
          clicks: Number(item.clicks ?? 0),
          reactions: Number(item.reactions ?? 0),
          comments: Number(item.comments ?? 0),
        };
      });

      setAnalytics(analyticsMap);
    } catch (error) {
      console.error('Error fetching subflow ads admin data:', error);
      toast.error('Не удалось загрузить аналитику рекламы');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(analyticsRange.from, analyticsRange.to);

    const refresh = () => {
      void fetchData(analyticsRange.from, analyticsRange.to);
    };

    const channels = [
      supabase
        .channel('admin-subflow-ads-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ads' }, refresh)
        .subscribe(),
      supabase
        .channel('admin-subflow-ad-analytics-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ad_events' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ad_reactions' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ad_comments' }, refresh)
        .subscribe(),
      supabase
        .channel('admin-ad-requests-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_requests' }, refresh)
        .subscribe(),
    ];

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [fetchData, analyticsRange.from, analyticsRange.to]);

  const handleEdit = (ad: SubFlowAd) => {
    setEditingAd(ad);
    setActiveTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('subflow_ads').delete().eq('id', id);
    if (error) { toast.error('Ошибка удаления'); return; }
    toast.success('Реклама удалена');
    fetchData(analyticsRange.from, analyticsRange.to);
  };

  const handleToggleActive = async (ad: SubFlowAd) => {
    const { error } = await supabase.from('subflow_ads').update({ is_active: !ad.is_active }).eq('id', ad.id);
    if (error) { toast.error('Ошибка'); return; }
    fetchData(analyticsRange.from, analyticsRange.to);
  };

  const handleUpdateRequestStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('ad_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Ошибка'); return; }
    toast.success(`Статус обновлен: ${status === 'approved' ? 'Одобрено' : status === 'rejected' ? 'Отклонено' : 'В ожидании'}`);
    fetchData(analyticsRange.from, analyticsRange.to);
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

  const analyticsDateLabel = useMemo(() => {
    if (analyticsDateRange.from && analyticsDateRange.to) {
      return `${format(analyticsDateRange.from, 'd MMM', { locale: ru })} — ${format(analyticsDateRange.to, 'd MMM', { locale: ru })}`;
    }
    if (analyticsDateRange.from) {
      return `с ${format(analyticsDateRange.from, 'd MMM', { locale: ru })}`;
    }
    return 'За всё время';
  }, [analyticsDateRange]);

  const totalStats = useMemo(() => {
    const vals = Object.values(analytics);
    const totalViews = vals.reduce((s, v) => s + v.views, 0);
    const totalClicks = vals.reduce((s, v) => s + v.clicks, 0);
    const totalReactions = vals.reduce((s, v) => s + v.reactions, 0);
    const totalComments = vals.reduce((s, v) => s + v.comments, 0);
    const avgCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';
    return { totalViews, totalClicks, totalReactions, totalComments, avgCtr };
  }, [analytics]);

  return (
    <AdminLayout title="Реклама subFlow">
      <TabSwitcher tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

      {activeTab === 'create' && (
        <div className="space-y-6">
          {canManage && (
            <SubFlowAdForm
              shops={shops}
              editingAd={editingAd}
              onSaved={() => { setEditingAd(null); fetchData(analyticsRange.from, analyticsRange.to); }}
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
        <div className="space-y-4">
          {/* Date filter + KPI summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <Popover open={analyticsCalendarOpen} onOpenChange={setAnalyticsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", analyticsDateRange.from && "border-primary text-primary")}>
                  <CalendarIcon size={14} />
                  {analyticsDateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={analyticsDateRange.from ? { from: analyticsDateRange.from, to: analyticsDateRange.to } : undefined}
                  onSelect={(range) => setAnalyticsDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={1}
                  locale={ru}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {analyticsDateRange.from && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setAnalyticsDateRange({ from: undefined, to: undefined }); setAnalyticsCalendarOpen(false); }}>
                Сбросить
              </Button>
            )}
          </div>

          {/* Summary KPIs */}
          {!isLoading && ads.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card><CardContent className="py-3 px-4 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Просмотры</p><p className="text-xl font-bold text-foreground">{totalStats.totalViews.toLocaleString()}</p></CardContent></Card>
              <Card><CardContent className="py-3 px-4 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Клики</p><p className="text-xl font-bold text-foreground">{totalStats.totalClicks.toLocaleString()}</p></CardContent></Card>
              <Card><CardContent className="py-3 px-4 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Средний CTR</p><p className="text-xl font-bold text-foreground">{totalStats.avgCtr}%</p></CardContent></Card>
              <Card><CardContent className="py-3 px-4 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Реакции</p><p className="text-xl font-bold text-foreground">{totalStats.totalReactions.toLocaleString()}</p></CardContent></Card>
              <Card><CardContent className="py-3 px-4 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Комменты</p><p className="text-xl font-bold text-foreground">{totalStats.totalComments.toLocaleString()}</p></CardContent></Card>
            </div>
          )}

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
