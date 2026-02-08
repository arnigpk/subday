import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface AdBanner {
  id: string;
  image_url: string;
  caption: string | null;
  shop_id: string | null;
  is_active: boolean;
  sort_order: number;
  autoplay_delay: number;
}

export function AdBannerCarousel() {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoplayDelay, setAutoplayDelay] = useState(4000);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ['ad-banners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as AdBanner[];
    },
    staleTime: 60 * 1000, // 1 minute
  });

  // Get autoplay delay from first banner (or use default)
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

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Update autoplay delay when it changes
  useEffect(() => {
    if (emblaApi && autoplayPlugin) {
      autoplayPlugin.reset();
    }
  }, [autoplayDelay, emblaApi]);

  const handleBannerClick = (banner: AdBanner) => {
    if (banner.shop_id) {
      navigate(`/shops/${banner.shop_id}`);
    }
  };

  if (isLoading) {
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
                className={`relative ${banner.shop_id ? 'cursor-pointer' : ''}`}
                onClick={() => handleBannerClick(banner)}
              >
                <img
                  src={banner.image_url}
                  alt={banner.caption || 'Рекламный баннер'}
                  className="w-full h-32 object-cover rounded-2xl"
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
          ))}
        </div>
      </div>
      
      {/* Dots indicator */}
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
