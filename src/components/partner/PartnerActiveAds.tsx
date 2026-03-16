import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Eye, MousePointerClick, TrendingUp, Image, FileText, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface PartnerActiveAdsProps {
  shopId: string | null;
}

export function PartnerActiveAds({ shopId }: PartnerActiveAdsProps) {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Fetch active banners for this shop
  const { data: banners = [], isLoading: bannersLoading } = useQuery({
    queryKey: ['partner-active-banners', shopId],
    queryFn: async () => {
      if (!shopId) return [];
      const { data, error } = await supabase
        .from('ad_banners')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!shopId,
  });

  // Fetch active subflow ads for this shop
  const { data: subflowAds = [], isLoading: adsLoading } = useQuery({
    queryKey: ['partner-active-subflow-ads', shopId],
    queryFn: async () => {
      if (!shopId) return [];
      const { data, error } = await supabase
        .from('subflow_ads')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!shopId,
  });

  const bannerIds = useMemo(() => banners.map(b => b.id), [banners]);
  const adIds = useMemo(() => subflowAds.map(a => a.id), [subflowAds]);

  // Fetch banner events
  const { data: bannerEvents = [], isLoading: bannerEventsLoading } = useQuery({
    queryKey: ['partner-banner-events', bannerIds, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async () => {
      if (bannerIds.length === 0) return [];
      let query = supabase
        .from('ad_banner_events')
        .select('*')
        .in('banner_id', bannerIds);
      if (dateRange.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: bannerIds.length > 0,
  });

  // Fetch subflow ad events
  const { data: adEvents = [], isLoading: adEventsLoading } = useQuery({
    queryKey: ['partner-ad-events', adIds, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async () => {
      if (adIds.length === 0) return [];
      let query = supabase
        .from('subflow_ad_events')
        .select('*')
        .in('ad_id', adIds);
      if (dateRange.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: adIds.length > 0,
  });

  const isLoading = bannersLoading || adsLoading;
  const hasAds = banners.length > 0 || subflowAds.length > 0;

  // Compute analytics per banner
  const bannerAnalytics = useMemo(() => {
    return banners.map(banner => {
      const events = bannerEvents.filter(e => e.banner_id === banner.id);
      const views = events.filter(e => e.event_type === 'view').length;
      const clicks = events.filter(e => e.event_type === 'click').length;
      const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
      return { ...banner, views, clicks, ctr, adType: 'banner' as const };
    });
  }, [banners, bannerEvents]);

  // Compute analytics per subflow ad
  const adAnalytics = useMemo(() => {
    return subflowAds.map(ad => {
      const events = adEvents.filter(e => e.ad_id === ad.id);
      const views = events.filter(e => e.event_type === 'view').length;
      const clicks = events.filter(e => e.event_type === 'click').length;
      const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
      return { ...ad, views, clicks, ctr, adType: 'subflow' as const };
    });
  }, [subflowAds, adEvents]);

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
          <BarChart3 size={32} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">У вашей кофейни пока нет активной рекламы</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Оставьте заявку выше, чтобы начать продвижение</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <BarChart3 size={18} className="text-primary" />
          Активная реклама
        </h3>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", dateRange.from && "border-primary text-primary")}>
              <CalendarIcon size={14} />
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

      {/* Banner ads */}
      {bannerAnalytics.map(banner => (
        <Card key={banner.id} className="border-accent/20 overflow-hidden">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Image size={14} className="text-accent flex-shrink-0" />
              <span className="truncate">{banner.caption || 'Баннер'}</span>
              <span className="text-[10px] font-normal text-muted-foreground ml-auto flex-shrink-0">
                {banner.display_location === 'home' ? 'Главная' : banner.display_location === 'shops' ? 'Кофейни' : 'Везде'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {banner.image_url && (
              <img src={banner.image_url} alt={banner.caption || 'Баннер'} className="w-full h-24 object-cover rounded-lg" />
            )}
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={<Eye size={14} />} label="Просмотры" value={banner.views} loading={bannerEventsLoading} />
              <StatCard icon={<MousePointerClick size={14} />} label="Клики" value={banner.clicks} loading={bannerEventsLoading} />
              <StatCard icon={<TrendingUp size={14} />} label="CTR" value={`${banner.ctr}%`} loading={bannerEventsLoading} />
            </div>
            {banner.starts_at || banner.ends_at ? (
              <p className="text-[10px] text-muted-foreground">
                {banner.starts_at && `С ${format(new Date(banner.starts_at), 'd MMM yyyy', { locale: ru })}`}
                {banner.starts_at && banner.ends_at && ' — '}
                {banner.ends_at && `До ${format(new Date(banner.ends_at), 'd MMM yyyy', { locale: ru })}`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {/* SubFlow ads */}
      {adAnalytics.map(ad => (
        <Card key={ad.id} className="border-primary/20 overflow-hidden">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText size={14} className="text-primary flex-shrink-0" />
              <span className="truncate">{ad.title || 'Реклама #subFlow'}</span>
              <span className="text-[10px] font-normal text-muted-foreground ml-auto flex-shrink-0">#subFlow</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {ad.image_url && (
              <img src={ad.image_url} alt={ad.title || 'Реклама'} className="w-full h-24 object-cover rounded-lg" />
            )}
            <p className="text-xs text-muted-foreground line-clamp-2">{ad.content}</p>
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={<Eye size={14} />} label="Просмотры" value={ad.views} loading={adEventsLoading} />
              <StatCard icon={<MousePointerClick size={14} />} label="Клики" value={ad.clicks} loading={adEventsLoading} />
              <StatCard icon={<TrendingUp size={14} />} label="CTR" value={`${ad.ctr}%`} loading={adEventsLoading} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Частота: каждый {ad.frequency}-й пост</span>
              {ad.daily_limit > 0 && <span>• Лимит: {ad.daily_limit}/день</span>}
            </div>
            {ad.starts_at || ad.ends_at ? (
              <p className="text-[10px] text-muted-foreground">
                {ad.starts_at && `С ${format(new Date(ad.starts_at), 'd MMM yyyy', { locale: ru })}`}
                {ad.starts_at && ad.ends_at && ' — '}
                {ad.ends_at && `До ${format(new Date(ad.ends_at), 'd MMM yyyy', { locale: ru })}`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number | string; loading: boolean }) {
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
