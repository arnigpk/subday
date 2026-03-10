import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

interface SubFlowImageViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export function SubFlowImageViewer({ images, initialIndex, onClose }: SubFlowImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);

  // Touch tracking refs
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  // Enter animation
  useEffect(() => {
    setIsAnimating(true);
    requestAnimationFrame(() => setIsAnimating(false));
  }, []);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setBgOpacity(1);
  }, []);

  const close = useCallback(() => {
    setBgOpacity(0);
    setTimeout(onClose, 200);
  }, [onClose]);

  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      pinchStartDistRef.current = getTouchDistance(e.touches);
      pinchStartScaleRef.current = scale;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      isDraggingRef.current = false;

      if (scale > 1) {
        panStartRef.current = { x: translateX, y: translateY };
      }
    }
  }, [scale, translateX, translateY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    // Pinch zoom
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dist = getTouchDistance(e.touches);
      const newScale = Math.min(3, Math.max(1, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
      setScale(newScale);
      if (newScale <= 1) {
        setTranslateX(0);
        setTranslateY(0);
      }
      return;
    }

    if (e.touches.length !== 1 || !touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    isDraggingRef.current = true;

    if (scale > 1) {
      // Pan when zoomed
      if (panStartRef.current) {
        setTranslateX(panStartRef.current.x + deltaX);
        setTranslateY(panStartRef.current.y + deltaY);
      }
    } else {
      // Swipe down to dismiss
      if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
        setTranslateY(deltaY);
        setBgOpacity(Math.max(0.2, 1 - deltaY / 400));
      }
      // Horizontal swipe between images
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setTranslateX(deltaX);
      }
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Pinch end
    if (pinchStartDistRef.current !== null && e.touches.length < 2) {
      pinchStartDistRef.current = null;
      if (scale <= 1) resetTransform();
      return;
    }

    if (!touchStartRef.current) return;

    const now = Date.now();
    const deltaY = translateY;
    const deltaX = translateX;

    // Double-tap detection
    if (!isDraggingRef.current || (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5)) {
      const timeSinceLastTap = now - lastTapRef.current;
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Double tap — toggle zoom
        if (scale > 1) {
          resetTransform();
        } else {
          setScale(2);
          setTranslateX(0);
          setTranslateY(0);
        }
        lastTapRef.current = 0;
        touchStartRef.current = null;
        return;
      }
      lastTapRef.current = now;
    }

    if (scale === 1) {
      // Swipe down dismiss
      if (deltaY > 150) {
        close();
        return;
      }

      // Horizontal swipe
      if (Math.abs(deltaX) > 60) {
        if (deltaX < -60 && currentIndex < images.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else if (deltaX > 60 && currentIndex > 0) {
          setCurrentIndex(prev => prev - 1);
        }
      }

      // Reset
      setTranslateX(0);
      setTranslateY(0);
      setBgOpacity(1);
    }

    touchStartRef.current = null;
    isDraggingRef.current = false;
    panStartRef.current = null;
  }, [scale, translateX, translateY, currentIndex, images.length, close, resetTransform]);

  // Reset on image change
  useEffect(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, [currentIndex]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{
        backgroundColor: `rgba(0,0,0,${bgOpacity * 0.95})`,
        transition: isDraggingRef.current ? 'none' : 'background-color 0.2s ease',
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        // Close on background click (desktop)
        if (e.target === containerRef.current) close();
      }}
    >
      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white backdrop-blur-sm"
      >
        <X size={24} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/10 text-white text-sm backdrop-blur-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <img
        src={images[currentIndex]}
        alt=""
        className="max-w-full max-h-full object-contain will-change-transform"
        draggable={false}
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transition: isDraggingRef.current ? 'none' : 'transform 0.25s ease',
        }}
      />

      {/* Dots indicator */}
      {images.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${
                i === currentIndex
                  ? 'w-5 h-2 bg-white'
                  : 'w-2 h-2 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
