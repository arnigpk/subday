import { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from '@/lib/utils';

interface ShopGalleryCarouselProps {
  images: string[];
  shopName: string;
  autoplayInterval?: number;
}

export function ShopGalleryCarousel({ 
  images, 
  shopName, 
  autoplayInterval = 3000 
}: ShopGalleryCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  // Handle selection change
  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Autoplay
  useEffect(() => {
    if (!emblaApi || images.length <= 1) return;

    const interval = setInterval(() => {
      emblaApi.scrollNext();
    }, autoplayInterval);

    return () => clearInterval(interval);
  }, [emblaApi, autoplayInterval, images.length]);

  // Single image - no carousel needed
  if (images.length <= 1) {
    return (
      <div className="w-full h-48 rounded-2xl overflow-hidden animate-pop">
        {images[0] ? (
          <img
            src={images[0]}
            alt={shopName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center text-6xl">
            ☕
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full animate-pop">
      {/* Carousel container */}
      <div ref={emblaRef} className="overflow-hidden rounded-2xl">
        <div className="flex">
          {images.map((url, index) => (
            <div
              key={index}
              className="flex-none w-full h-48"
            >
              <img
                src={url}
                alt={`${shopName} - фото ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dots indicator */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => emblaApi?.scrollTo(index)}
            className={cn(
              'w-2 h-2 rounded-full transition-all duration-300',
              index === selectedIndex
                ? 'bg-white w-4'
                : 'bg-white/50'
            )}
            aria-label={`Перейти к фото ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
