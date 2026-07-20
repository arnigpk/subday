import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { openWithDeepLink } from '@/utils/deepLinks';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useUserAudienceMatch } from '@/hooks/useUserAudienceMatch';
import { useAdEligibility, type UserAdStat } from '@/hooks/useAdEligibility';
import {
  matchesDateRange, matchesGeo, matchesDayOfWeek, matchesHours, withinBudget,
  matchesSubscriptionTarget, withinDailyLimit, withinMinInterval, weightedOrder, pickAbVariant,
  matchesBehavior, withinPacing,
  type TargetableAd,
} from '@/lib/adTargeting';

interface AdBanner extends TargetableAd {
  id: string;
  image_url: string;
  caption: string | null;
  shop_id: string | null;
  external_url: string | null;
  is_active: boolean;
  sort_order: number;
  autoplay_delay: number;
  display_location: string;
  caption_b?: string | null;
  image_url_b?: string | null;
}

function preloadImages(urls: string[]) {
  urls.forEach(url => { const img = new Image(); img.src = url; });
}

interface AdBannerCarouselProps { location?: 'home' | 'shops' }

/** Слайд: показ засчитываем ТОЛЬКО когда баннер реально виден (не при рендере). */
function BannerSlide({ banner, image, caption, variant, hasLink, onVisible, onClick }: {
  banner: AdBanner; image: string; caption: string | null; variant: 'A' | 'B'; hasLink: boolean;
  onVisible: (id: string, variant: 'A' | 'B') => void; onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || firedRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(entries => {
      const e = entries[0];
      if (e?.isIntersecting && e.intersectionRatio >= 0.5) {
        // Виден минимум 1 сек — только тогда это настоящий показ.
        timer = setTimeout(() => { if (!firedRef.current) { firedRef.current = true; onVisible(banner.id, variant); } }, 1000);
      } else if (timer) { clearTimeout(timer); timer = null; }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [banner.id, onVisible, variant]);

  return (
    <div className="flex-[0_0_100%] min-w-0" ref={ref}>
      <div className={`relative ${hasLink ? 'cursor-pointer' : ''}`} onClick={onClick}>
        <img src={image} alt={caption || 'Рекламный баннер'} className="w-full h-32 object-cover rounded-2xl" />
        {caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-2xl">
            <p className="text-white text-sm font-medium truncate text-center">{caption}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdBannerCarousel({ location = 'shops' }: AdBannerCarouselProps) {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const viewedBanners = useRef<Set<string>>(new Set());
  const preloadedRef = useRef(false);
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const userCity = profile?.city || null;
  const { matchesAudience, isLoading: isAudienceLoading } = useUserAudienceMatch();
  const {
    userId, userSubTypeIds, isLoading: isEligLoading, affinity,
    loadStats, loadTotalToday, capExhausted, noteView,
  } = useAdEligibility('banner');
  const [perUser, setPerUser] = useState<Map<string, UserAdStat> | null>(null);
  const [capReached, setCapReached] = useState(false);

  const { data: allBanners = [], isLoading } = useQuery({
    queryKey: ['ad-banners', location, userCountry],
    queryFn: async () => {
      const { data, error } = await supabase.from('ad_banners').select('*').eq('is_active', true).order('sort_order', { ascending: true });
      if (error) throw error;
      const now = new Date();
      return ((data as AdBanner[]) || []).filter(b =>
        (b.display_location === location || b.display_location === 'both') &&
        matchesGeo(b, userCountry, userCity) &&
        matchesDateRange(b, now) &&
        matchesDayOfWeek(b, now) &&
        matchesHours(b, now) &&
        withinBudget(b) &&
        withinPacing(b, now),
      );
    },
    staleTime: 60 * 1000,
  });

  // Аудитория + таргет на тариф + поведение относительно кофейни (реактивно).
  const targeted = useMemo(() => {
    if (isAudienceLoading || isEligLoading) return [];
    const now = new Date();
    return allBanners.filter(b =>
      matchesAudience(b.audience_types || ['all']) &&
      matchesSubscriptionTarget(b, userSubTypeIds) &&
      matchesBehavior(b, affinity, now),
    );
  }, [allBanners, matchesAudience, isAudienceLoading, isEligLoading, userSubTypeIds, affinity]);

  // Персональные лимиты (дневной лимит + частотный кап) + общий потолок реклам.
  useEffect(() => {
    let cancelled = false;
    const ids = targeted.map(b => b.id);
    if (ids.length === 0 || !userId) { setPerUser(new Map()); return; }
    (async () => {
      const totalToday = await loadTotalToday();
      if (cancelled) return;
      if (capExhausted(totalToday)) { setPerUser(new Map()); setCapReached(true); return; }
      const m = await loadStats(ids);
      if (!cancelled) { setCapReached(false); setPerUser(m); }
    })();
    return () => { cancelled = true; };
  }, [targeted, userId, loadStats, loadTotalToday, capExhausted]);

  // Итоговый список: лимиты + взвешенная ротация внутри одинакового sort_order.
  const banners = useMemo(() => {
    if (perUser === null || capReached) return [];
    const now = new Date();
    const eligible = targeted.filter(b => {
      const st = perUser.get(b.id);
      return withinDailyLimit(b, st?.todayViews || 0) && withinMinInterval(b, st?.lastViewAt || null, now);
    });
    const groups = new Map<number, AdBanner[]>();
    eligible.forEach(b => { const k = b.sort_order ?? 0; groups.set(k, [...(groups.get(k) || []), b]); });
    return [...groups.keys()].sort((a, b) => a - b).flatMap(k => weightedOrder(groups.get(k)!, userId || 'anon'));
  }, [targeted, perUser, userId, capReached]);

  // A/B-вариант креатива (стабильный для пользователя).
  const creativeOf = useCallback((b: AdBanner) => {
    const v = pickAbVariant(b, userId);
    return v === 'B'
      ? { variant: v, image: b.image_url_b || b.image_url, caption: b.caption_b ?? b.caption }
      : { variant: v, image: b.image_url, caption: b.caption };
  }, [userId]);

  useEffect(() => {
    if (banners.length > 0 && !preloadedRef.current) {
      preloadedRef.current = true;
      preloadImages(banners.map(b => creativeOf(b).image));
      const firstImg = new Image();
      firstImg.onload = () => setImagesLoaded(true);
      firstImg.onerror = () => setImagesLoaded(true);
      firstImg.src = creativeOf(banners[0]).image;
    }
  }, [banners, creativeOf]);

  // Задержка прокрутки — ИНДИВИДУАЛЬНАЯ для каждого слайда (раньше бралась только у первого).
  const delaysRef = useRef<number[]>([]);
  useEffect(() => { delaysRef.current = banners.map(b => (b.autoplay_delay || 4) * 1000); }, [banners]);
  const autoplayPlugin = useMemo(() => Autoplay({
    delay: (scrollSnaps: number[]) => scrollSnaps.map((_, i) => delaysRef.current[i] ?? 4000),
    stopOnInteraction: false,
    stopOnMouseEnter: true,
  }), []);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'center' }, [autoplayPlugin]);

  const trackView = useCallback(async (bannerId: string, abVariant: 'A' | 'B') => {
    if (viewedBanners.current.has(bannerId)) return;
    viewedBanners.current.add(bannerId);
    noteView(bannerId); // сразу учитываем в лимитах
    try {
      await supabase.from('ad_banner_events').insert({
        banner_id: bannerId, event_type: 'view', user_id: userId, ab_variant: abVariant,
      });
    } catch (error) { console.error('Failed to track banner view:', error); }
  }, [noteView, userId]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => { emblaApi.off('select', onSelect); emblaApi.off('reInit', onSelect); };
  }, [emblaApi, onSelect]);

  useEffect(() => { if (emblaApi) emblaApi.reInit(); }, [banners.length, emblaApi]);

  const handleBannerClick = async (banner: AdBanner) => {
    try {
      await supabase.from('ad_banner_events').insert({
        banner_id: banner.id, event_type: 'click', user_id: userId,
        ab_variant: creativeOf(banner).variant,
      });
    } catch (error) { console.error('Failed to track banner click:', error); }
    if (banner.shop_id) navigate(`/shops/${banner.shop_id}`);
    else if (banner.external_url) openWithDeepLink(banner.external_url);
  };

  const hasLink = (banner: AdBanner) => !!(banner.shop_id || banner.external_url);

  if (isLoading || isAudienceLoading || isEligLoading || perUser === null || (banners.length > 0 && !imagesLoaded)) {
    return <div className="w-full mb-4"><Skeleton className="w-full h-32 rounded-2xl" /></div>;
  }
  if (banners.length === 0) return null;

  return (
    <div className="w-full mb-4">
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {banners.map(banner => {
            const c = creativeOf(banner);
            return (
              <BannerSlide
                key={banner.id}
                banner={banner}
                image={c.image}
                caption={c.caption}
                variant={c.variant}
                hasLink={hasLink(banner)}
                onVisible={trackView}
                onClick={() => handleBannerClick(banner)}
              />
            );
          })}
        </div>
      </div>
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {banners.map((_, index) => (
            <button
              key={index}
              className={`w-1.5 h-1.5 rounded-full transition-all ${index === selectedIndex ? 'bg-primary w-4' : 'bg-muted-foreground/30'}`}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
