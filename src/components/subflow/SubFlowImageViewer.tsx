import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [bgOpacity, setBgOpacity] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

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

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setBgOpacity(1));
    });
  }, []);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setBgOpacity(1);
  }, []);

  const close = useCallback(() => {
    setIsClosing(true);
    setBgOpacity(0);
    setTimeout(onClose, 250);
  }, [onClose]);

  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
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

    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dist = getTouchDistance(e.touches);
      const newScale = Math.min(3, Math.max(1, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
      setScale(newScale);
      if (newScale <= 1) { setTranslateX(0); setTranslateY(0); }
      return;
    }

    if (e.touches.length !== 1 || !touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    isDraggingRef.current = true;

    if (scale > 1) {
      if (panStartRef.current) {
        setTranslateX(panStartRef.current.x + deltaX);
        setTranslateY(panStartRef.current.y + deltaY);
      }
    } else {
      if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
        setTranslateY(deltaY);
        setBgOpacity(Math.max(0, 1 - deltaY / 300));
      }
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setTranslateX(deltaX);
      }
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (pinchStartDistRef.current !== null && e.touches.length < 2) {
      pinchStartDistRef.current = null;
      if (scale <= 1) resetTransform();
      return;
    }

    if (!touchStartRef.current) return;

    const now = Date.now();
    const deltaY = translateY;
    const deltaX = translateX;

    // Double-tap
    if (!isDraggingRef.current || (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5)) {
      const timeSinceLastTap = now - lastTapRef.current;
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        if (scale > 1) resetTransform();
        else { setScale(2); setTranslateX(0); setTranslateY(0); }
        lastTapRef.current = 0;
        touchStartRef.current = null;
        return;
      }
      lastTapRef.current = now;
    }

    if (scale === 1) {
      if (deltaY > 120) { close(); return; }
      if (Math.abs(deltaX) > 60) {
        if (deltaX < -60 && currentIndex < images.length - 1) setCurrentIndex(prev => prev + 1);
        else if (deltaX > 60 && currentIndex > 0) setCurrentIndex(prev => prev - 1);
      }
      setTranslateX(0);
      setTranslateY(0);
      setBgOpacity(1);
    }

    touchStartRef.current = null;
    isDraggingRef.current = false;
    panStartRef.current = null;
  }, [scale, translateX, translateY, currentIndex, images.length, close, resetTransform]);

  useEffect(() => {
    setScale(1); setTranslateX(0); setTranslateY(0);
  }, [currentIndex]);

  const viewer = (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{
        zIndex: 99999,
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        transition: isDraggingRef.current ? 'none' : 'background-color 0.25s ease',
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => { if (e.target === containerRef.current) close(); }}
    >
      {/* Close */}
      <button
        onClick={close}
        className="absolute top-3 right-3 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-md active:scale-90 transition-transform"
        style={{ zIndex: 100000, opacity: bgOpacity }}
      >
        <X size={22} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/40 text-white/90 text-xs font-medium backdrop-blur-md"
          style={{ zIndex: 100000, opacity: bgOpacity }}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <img
        src={images[currentIndex]}
        alt=""
        className="w-full h-full object-contain will-change-transform"
        draggable={false}
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transition: isDraggingRef.current ? 'none' : 'transform 0.25s ease',
        }}
      />

      {/* Dots */}
      {images.length > 1 && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5"
          style={{ zIndex: 100000, opacity: bgOpacity }}
        >
          {images.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-200 ${
                i === currentIndex ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(viewer, document.body);
}
