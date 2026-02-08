import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { openWithDeepLink } from '@/utils/deepLinks';
import { queryKeys, prefetchAdBanners } from '@/hooks/usePrefetch';

interface AdBanner {
  id: string;
  image_url: string;
  caption: string | null;
  shop_id: string | null;
  external_url: string | null;
  sort_order: number;
  autoplay_delay: number;
}

// Preload images for instant display
function preloadImages(urls: string[]) {
  urls.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

const BannerDots = memo(function BannerDots({ 
  count, 
  selectedIndex, 
  onDotClick 
}: { 
  count: number; 
  selectedIndex: number; 
  onDotClick: (index: number) => void;
}) {
  if (count <= 1) return null;
  
  return (
    <div className="flex justify-center gap-1.5 mt-2">
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          className={`w-1.5 h-1.5 rounded-full transition-all ${
            index === selectedIndex
              ? 'bg-primary w-4'
              : 'bg-muted-foreground/30'
          }`}
          onClick={() => onDotClick(index)}
        />
      ))}
    </div>
  );
});

export const AdBannerCarousel = memo(function AdBannerCarousel() {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoplayDelay, setAutoplayDelay] = useState(4000);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const viewedBanners = useRef<Set<string>>(new Set());
  const preloadedRef = useRef(false);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: queryKeys.adBanners,
    queryFn: prefetchAdBanners,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Preload all banner images when data is loaded
  useEffect(() => {
    if (banners.length > 0 && !preloadedRef.current) {
      preloadedRef.current = true;
      const imageUrls = banners.map(b => b.image_url);
      preloadImages(imageUrls);
      
      // Wait for first image to load before showing carousel
      const firstImg = new Image();
      firstImg.onload = () => setImagesLoaded(true);
      firstImg.onerror = () => setImagesLoaded(true); // Show anyway on error
      firstImg.src = banners[0].image_url;
    }
  }, [banners]);

  // Get autoplay delay from first banner
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

  // Track banner view (fire and forget)
  const trackView = useCallback((bannerId: string) => {
    if (viewedBanners.current.has(bannerId)) return;
    viewedBanners.current.add(bannerId);
    
    // Fire and forget - don't await
    supabase
      .from('ad_banner_events')
      .insert({ banner_id: bannerId, event_type: 'view' })
      .then(() => {}, () => {});
  }, []);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const index = emblaApi.selectedScrollSnap();
    setSelectedIndex(index);
    
    // Track view for current banner
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

  // Track click and navigate
  const handleBannerClick = useCallback((banner: AdBanner) => {
    // Track click (fire and forget)
    supabase
      .from('ad_banner_events')
      .insert({ banner_id: banner.id, event_type: 'click' })
      .then(() => {}, () => {});
    
    if (banner.shop_id) {
      navigate(`/shops/${banner.shop_id}`);
    } else if (banner.external_url) {
      openWithDeepLink(banner.external_url);
    }
  }, [navigate]);

  const handleDotClick = useCallback((index: number) => {
    emblaApi?.scrollTo(index);
  }, [emblaApi]);

  // Show skeleton while loading data or images
  if (isLoading || (banners.length > 0 && !imagesLoaded)) {
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
          {banners.map((banner) => {
            const hasLink = banner.shop_id || banner.external_url;
            return (
              <div
                key={banner.id}
                className="flex-[0_0_100%] min-w-0"
              >
                <div 
                  className={`relative ${hasLink ? 'cursor-pointer' : ''}`}
                  onClick={() => handleBannerClick(banner)}
                >
                  <img
                    src={banner.image_url}
                    alt={banner.caption || 'Рекламный баннер'}
                    className="w-full h-32 object-cover rounded-2xl"
                    loading="eager"
                  />
                  {banner.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-2xl">
                      <p className="text-white text-sm font-medium truncate">
                        {banner.caption}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <BannerDots
        count={banners.length}
        selectedIndex={selectedIndex}
        onDotClick={handleDotClick}
      />
    </div>
  );
});
