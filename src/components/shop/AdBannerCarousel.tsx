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

interface AdBanner {
  id: string;
  image_url: string;
  caption: string | null;
  shop_id: string | null;
  external_url: string | null;
  is_active: boolean;
  sort_order: number;
  autoplay_delay: number;
  display_location: string;
  country: string | null;
  city: string | null;
  audience_types: string[];
  starts_at: string | null;
  ends_at: string | null;
}

function preloadImages(urls: string[]) {
  urls.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

interface AdBannerCarouselProps {
  location?: 'home' | 'shops';
}

export function AdBannerCarousel({ location = 'shops' }: AdBannerCarouselProps) {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoplayDelay, setAutoplayDelay] = useState(4000);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const viewedBanners = useRef<Set<string>>(new Set());
  const preloadedRef = useRef(false);
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const userCity = profile?.city || null;
  const { matchesAudience, isLoading: isAudienceLoading } = useUserAudienceMatch();

  // Fetch all active banners (no audience filtering here)
  const { data: allBanners = [], isLoading } = useQuery({
    queryKey: ['ad-banners', location, userCountry],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      
      const now = new Date();
      return ((data as AdBanner[]) || []).filter(banner => {
        const locationMatch = banner.display_location === location || banner.display_location === 'both';
        const countryMatch = !banner.country || banner.country === userCountry;
        const cityMatch = !banner.city || !userCity || banner.city === userCity;
        const startsOk = !banner.starts_at || new Date(banner.starts_at) <= now;
        const endsOk = !banner.ends_at || new Date(banner.ends_at) > now;
        return locationMatch && countryMatch && cityMatch && startsOk && endsOk;
      });
    },
    staleTime: 60 * 1000,
  });

  // Apply audience filtering reactively (re-runs when matchesAudience updates)
  const banners = useMemo(() => {
    if (isAudienceLoading) return [];
    return allBanners.filter(banner => matchesAudience(banner.audience_types));
  }, [allBanners, matchesAudience, isAudienceLoading]);

  // Preload all banner images when data is loaded
  useEffect(() => {
    if (banners.length > 0 && !preloadedRef.current) {
      preloadedRef.current = true;
      const imageUrls = banners.map(b => b.image_url);
      preloadImages(imageUrls);
      
      const firstImg = new Image();
      firstImg.onload = () => setImagesLoaded(true);
      firstImg.onerror = () => setImagesLoaded(true);
      firstImg.src = banners[0].image_url;
    }
  }, [banners]);

  useEffect(() => {
    if (banners.length > 0 && banners[0].autoplay_delay) {
      setAutoplayDelay(banners[0].autoplay_delay * 1000);
    }
  }, [banners]);

  const autoplayPlugin = Autoplay({
    delay: autoplayDelay,
    stopOnInteraction: false,
    stopOnMouseEnter: true,
  });

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center' },
    [autoplayPlugin]
  );

  const trackView = useCallback(async (bannerId: string) => {
    if (viewedBanners.current.has(bannerId)) return;
    viewedBanners.current.add(bannerId);
    
    try {
      await supabase
        .from('ad_banner_events')
        .insert({ banner_id: bannerId, event_type: 'view' });
    } catch (error) {
      console.error('Failed to track banner view:', error);
    }
  }, []);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const index = emblaApi.selectedScrollSnap();
    setSelectedIndex(index);
    
    if (banners[index]) {
      trackView(banners[index].id);
    }
  }, [emblaApi, banners, trackView]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (emblaApi && autoplayPlugin) {
      autoplayPlugin.reset();
    }
  }, [autoplayDelay, emblaApi]);

  const handleBannerClick = async (banner: AdBanner) => {
    try {
      await supabase
        .from('ad_banner_events')
        .insert({ banner_id: banner.id, event_type: 'click' });
    } catch (error) {
      console.error('Failed to track banner click:', error);
    }
    
    if (banner.shop_id) {
      navigate(`/shops/${banner.shop_id}`);
    } else if (banner.external_url) {
      openWithDeepLink(banner.external_url);
    }
  };

  const hasLink = (banner: AdBanner) => {
    return banner.shop_id || banner.external_url;
  };

  if (isLoading || isAudienceLoading || (banners.length > 0 && !imagesLoaded)) {
    return (
      <div className="w-full mb-4">
        <Skeleton className="w-full h-32 rounded-2xl" />
      </div>
    );
  }

  if (banners.length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-4">
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="flex-[0_0_100%] min-w-0"
            >
              <div 
                className={`relative ${hasLink(banner) ? 'cursor-pointer' : ''}`}
                onClick={() => handleBannerClick(banner)}
              >
                <img
                  src={banner.image_url}
                  alt={banner.caption || 'Рекламный баннер'}
                  className="w-full h-32 object-cover rounded-2xl"
                />
                {banner.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-2xl">
                    <p className="text-white text-sm font-medium truncate text-center">
                      {banner.caption}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {banners.map((_, index) => (
            <button
              key={index}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === selectedIndex
                  ? 'bg-primary w-4'
                  : 'bg-muted-foreground/30'
              }`}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}