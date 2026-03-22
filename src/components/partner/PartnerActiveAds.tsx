import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartBarIcon, EyeIcon, CursorArrowRippleIcon, ArrowTrendingUpIcon, PhotoIcon, DocumentTextIcon, CalendarIcon, HeartIcon, ChatBubbleOvalLeftIcon } from '@heroicons/react/24/outline';;
import { endOfDay, format, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PartnerActiveAdsProps {
  shopId: string | null;
}

interface BannerAnalyticsRow {
  banner_id: string;
  views: number;
  clicks: number;
}

interface SubflowAnalyticsRow {
  ad_id: string;
  views: number;
  clicks: number;
  reactions: number;
  comments: number;
}

export function PartnerActiveAds({ shopId }: PartnerActiveAdsProps) {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const analyticsRange = useMemo(() => ({
    from: dateRange.from ? startOfDay(dateRange.from).toISOString() : null,
    to: dateRange.to ? endOfDay(dateRange.to).toISOString() : null,
  }), [dateRange.from, dateRange.to]);

  const { data: banners = [], isLoading: bannersLoading } = useQuery({
    queryKey: ['partner-all-banners', shopId],
    queryFn: async () => {
      if (!shopId) return [];
      const { data, error } = await supabase
        .from('ad_banners')
        .select('*')
        .eq('shop_id', shopId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!shopId,
  });

  const { data: subflowAds = [], isLoading: adsLoading } = useQuery({
    queryKey: ['partner-all-subflow-ads', shopId],
    queryFn: async () => {
      if (!shopId) return [];
      const { data, error } = await supabase
        .from('subflow_ads')
        .select('*')
        .eq('shop_id', shopId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!shopId,
  });

  const { data: bannerAnalyticsRows = [], isLoading: bannerAnalyticsLoading } = useQuery({
    queryKey: ['partner-banner-analytics', shopId, analyticsRange.from, analyticsRange.to],
    queryFn: async () => {
      if (!shopId) return [];
      const { data, error } = await supabase.rpc('get_banner_analytics' as any, {
        _shop_id: shopId,
        _from: analyticsRange.from,
        _to: analyticsRange.to,
      });
      if (error) throw error;
      return ((data as any[]) || []).map((item) => ({
        banner_id: item.banner_id,
        views: Number(item.views ?? 0),
        clicks: Number(item.clicks ?? 0),
      })) as BannerAnalyticsRow[];
    },
    enabled: !!shopId,
  });

  const { data: adAnalyticsRows = [], isLoading: adAnalyticsLoading } = useQuery({
    queryKey: ['partner-subflow-ad-analytics', shopId, analyticsRange.from, analyticsRange.to],
    queryFn: async () => {
      if (!shopId) return [];
      const { data, error } = await supabase.rpc('get_subflow_ad_analytics' as any, {
        _shop_id: shopId,
        _from: analyticsRange.from,
        _to: analyticsRange.to,
      });
      if (error) throw error;
      return ((data as any[]) || []).map((item) => ({
        ad_id: item.ad_id,
        views: Number(item.views ?? 0),
        clicks: Number(item.clicks ?? 0),
        reactions: Number(item.reactions ?? 0),
        comments: Number(item.comments ?? 0),
      })) as SubflowAnalyticsRow[];
    },
    enabled: !!shopId,
  });

  useEffect(() => {
    if (!shopId) return;

    const invalidateBannerAnalytics = () => {
      queryClient.invalidateQueries({ queryKey: ['partner-banner-analytics'] });
    };

    const invalidateSubflowAnalytics = () => {
      queryClient.invalidateQueries({ queryKey: ['partner-subflow-ad-analytics'] });
    };

    const channels = [
      supabase
        .channel('partner-banner-events-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_banner_events' }, invalidateBannerAnalytics)
        .subscribe(),
      supabase
        .channel('partner-banners-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_banners' }, () => {
          queryClient.invalidateQueries({ queryKey: ['partner-all-banners'] });
          invalidateBannerAnalytics();
        })
        .subscribe(),
      supabase
        .channel('partner-subflow-events-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ad_events' }, invalidateSubflowAnalytics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ad_reactions' }, invalidateSubflowAnalytics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ad_comments' }, invalidateSubflowAnalytics)
        .subscribe(),
      supabase
        .channel('partner-subflow-ads-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_ads' }, () => {
          queryClient.invalidateQueries({ queryKey: ['partner-all-subflow-ads'] });
          invalidateSubflowAnalytics();
        })
        .subscribe(),
    ];

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [shopId, queryClient]);

  const isLoading = bannersLoading || adsLoading;
  const hasAds = banners.length > 0 || subflowAds.length > 0;

  const bannerAnalytics = useMemo(() => {
    const statsMap = new Map(bannerAnalyticsRows.map((row) => [row.banner_id, row]));

    return banners.map((banner) => {
      const stats = statsMap.get(banner.id);
      const views = Number(stats?.views ?? 0);
      const clicks = Number(stats?.clicks ?? 0);
      const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';

      return { ...banner, views, clicks, ctr, adType: 'banner' as const };
    });
  }, [banners, bannerAnalyticsRows]);

  const adAnalytics = useMemo(() => {
    const statsMap = new Map(adAnalyticsRows.map((row) => [row.ad_id, row]));

    return subflowAds.map((ad) => {
      const stats = statsMap.get(ad.id);
      const views = Number(stats?.views ?? 0);
      const clicks = Number(stats?.clicks ?? 0);
      const reactions = Number(stats?.reactions ?? 0);
      const comments = Number(stats?.comments ?? 0);
      const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';

      return { ...ad, views, clicks, reactions, comments, ctr, adType: 'subflow' as const };
    });
  }, [subflowAds, adAnalyticsRows]);

  const handleDateSelect = (range: { from?: Date; to?: Date } | undefined) => {
    setDateRange({ from: range?.from, to: range?.to });
  };

  const clearDateFilter = () => {
    setDateRange({ from: undefined, to: undefined });
    setCalendarOpen(false);
  };

  const dateLabel = useMemo(() => {
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, 'd MMM', { locale: ru })} — ${format(dateRange.to, 'd MMM', { locale: ru })}`;
    }
    if (dateRange.from) {
      return `с ${format(dateRange.from, 'd MMM', { locale: ru })}`;
    }
    return 'За всё время';
  }, [dateRange]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!hasAds) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="py-8 text-center">
          <ChartBarIcon className="w-8 h-8" className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">У вашей кофейни пока нет рекламных кампаний</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Оставьте заявку выше, чтобы начать продвижение</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <ChartBarIcon className="w-[18px] h-[18px]" className="text-primary" />
          Рекламные кампании
        </h3>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('text-xs gap-1.5', dateRange.from && 'border-primary text-primary')}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
              onSelect={handleDateSelect}
              numberOfMonths={1}
              locale={ru}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {dateRange.from && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={clearDateFilter}>
            Сбросить
          </Button>
        )}
      </div>

      {bannerAnalytics.map((banner) => (
        <Card key={banner.id} className={cn('overflow-hidden', banner.is_active ? 'border-accent/20' : 'border-muted-foreground/20 opacity-75')}>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <PhotoIcon className="w-3.5 h-3.5" className="text-accent flex-shrink-0" />
              <span className="truncate">{banner.caption || 'Баннер'}</span>
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <Badge variant={banner.is_active ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 h-4">
                  {banner.is_active ? 'Активна' : 'Завершена'}
                </Badge>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {banner.display_location === 'home' ? 'Главная' : banner.display_location === 'shops' ? 'Кофейни' : 'Везде'}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {banner.image_url && (
              <img src={banner.image_url} alt={banner.caption || 'Баннер'} className="w-full h-24 object-cover rounded-lg" />
            )}
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={<EyeIcon className="w-3.5 h-3.5" />} label="Просмотры" value={banner.views} loading={bannerAnalyticsLoading} />
              <StatCard icon={<CursorArrowRippleIcon className="w-3.5 h-3.5" />} label="Клики" value={banner.clicks} loading={bannerAnalyticsLoading} />
              <StatCard icon={<ArrowTrendingUpIcon className="w-3.5 h-3.5" />} label="CTR" value={`${banner.ctr}%`} loading={bannerAnalyticsLoading} />
            </div>
            {(banner.starts_at || banner.ends_at) && (
              <p className="text-[10px] text-muted-foreground">
                {banner.starts_at && `С ${format(new Date(banner.starts_at), 'd MMM yyyy', { locale: ru })}`}
                {banner.starts_at && banner.ends_at && ' — '}
                {banner.ends_at && `До ${format(new Date(banner.ends_at), 'd MMM yyyy', { locale: ru })}`}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {adAnalytics.map((ad) => (
        <Card key={ad.id} className={cn('overflow-hidden', ad.is_active ? 'border-primary/20' : 'border-muted-foreground/20 opacity-75')}>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DocumentTextIcon className="w-3.5 h-3.5" className="text-primary flex-shrink-0" />
              <span className="truncate">{ad.title || 'Реклама #subFlow'}</span>
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <Badge variant={ad.is_active ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 h-4">
                  {ad.is_active ? 'Активна' : 'Завершена'}
                </Badge>
                <span className="text-[10px] font-normal text-muted-foreground">#subFlow</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {ad.image_url && (
              <img src={ad.image_url} alt={ad.title || 'Реклама'} className="w-full h-24 object-cover rounded-lg" />
            )}
            <p className="text-xs text-muted-foreground line-clamp-2">{ad.content}</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <StatCard icon={<EyeIcon className="w-3.5 h-3.5" />} label="Просмотры" value={ad.views} loading={adAnalyticsLoading} />
              <StatCard icon={<CursorArrowRippleIcon className="w-3.5 h-3.5" />} label="Клики" value={ad.clicks} loading={adAnalyticsLoading} />
              <StatCard icon={<ArrowTrendingUpIcon className="w-3.5 h-3.5" />} label="CTR" value={`${ad.ctr}%`} loading={adAnalyticsLoading} />
              <StatCard icon={<HeartIcon className="w-3.5 h-3.5" />} label="Реакции" value={ad.reactions} loading={adAnalyticsLoading} />
              <StatCard icon={<ChatBubbleOvalLeftIcon className="w-3.5 h-3.5" />} label="Комменты" value={ad.comments} loading={adAnalyticsLoading} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
              <span>Частота: каждый {ad.frequency}-й пост</span>
              {ad.daily_limit > 0 && <span>• Лимит: {ad.daily_limit}/день</span>}
            </div>
            {(ad.starts_at || ad.ends_at) && (
              <p className="text-[10px] text-muted-foreground">
                {ad.starts_at && `С ${format(new Date(ad.starts_at), 'd MMM yyyy', { locale: ru })}`}
                {ad.starts_at && ad.ends_at && ' — '}
                {ad.ends_at && `До ${format(new Date(ad.ends_at), 'd MMM yyyy', { locale: ru })}`}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, loading }: { icon: ReactNode; label: string; value: number | string; loading: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-secondary/50 text-center">
      <div className="flex items-center justify-center text-primary mb-0.5">{icon}</div>
      {loading ? (
        <Skeleton className="h-5 w-8 mx-auto" />
      ) : (
        <p className="text-sm font-bold text-foreground">{value}</p>
      )}
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
