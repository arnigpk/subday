import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SourceRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SubFlowImageViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
  sourceRect?: SourceRect | null;
}

export function SubFlowImageViewer({ images, initialIndex, onClose, sourceRect }: SubFlowImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [phase, setPhase] = useState<'morph-in' | 'open' | 'closing'>('morph-in');

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const pinchMidRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Compute morph styles
  const getMorphStyle = useCallback((): React.CSSProperties => {
    if (!sourceRect) return { opacity: 0 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = sourceRect.width / vw;
    const scaleY = sourceRect.height / vh;
    const s = Math.max(scaleX, scaleY);
    const originX = sourceRect.left + sourceRect.width / 2;
    const originY = sourceRect.top + sourceRect.height / 2;
    const dx = originX - vw / 2;
    const dy = originY - vh / 2;
    return {
      transform: `translate(${dx}px, ${dy}px) scale(${s})`,
      opacity: 1,
    };
  }, [sourceRect]);

  // Lock body scroll
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  // Morph-in animation
  useEffect(() => {
    // Start morph then transition to open
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPhase('open');
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, []);

  const close = useCallback(() => {
    setPhase('closing');
    setTimeout(onClose, 300);
  }, [onClose]);

  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchMidpoint = (touches: React.TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDistRef.current = getTouchDistance(e.touches);
      pinchStartScaleRef.current = scale;
      pinchMidRef.current = getTouchMidpoint(e.touches);
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

    // Pinch zoom — continuous, smooth
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dist = getTouchDistance(e.touches);
      const ratio = dist / pinchStartDistRef.current;
      const newScale = Math.min(4, Math.max(0.5, pinchStartScaleRef.current * ratio));
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
      // Swipe down to dismiss or horizontal to navigate
      if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
        setTranslateY(deltaY);
      }
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setTranslateX(deltaX);
      }
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // End of pinch
    if (pinchStartDistRef.current !== null && e.touches.length < 2) {
      pinchStartDistRef.current = null;
      pinchMidRef.current = null;
      // Snap back if zoomed out too far
      if (scale < 1) {
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
      }
      return;
    }

    if (!touchStartRef.current) return;

    const now = Date.now();
    const dY = translateY;
    const dX = translateX;

    // Double-tap detection
    if (!isDraggingRef.current || (Math.abs(dX) < 5 && Math.abs(dY) < 5)) {
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

    if (scale <= 1) {
      // Swipe down dismiss
      if (dY > 100) { close(); return; }
      // Swipe horizontal to navigate
      if (Math.abs(dX) > 60) {
        if (dX < -60 && currentIndex < images.length - 1) setCurrentIndex(prev => prev + 1);
        else if (dX > 60 && currentIndex > 0) setCurrentIndex(prev => prev - 1);
      }
      setTranslateX(0);
      setTranslateY(0);
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

  const isZoomed = scale > 1;
  const isDragging = isDraggingRef.current;
  const bgOpacity = phase === 'closing'
    ? 0
    : phase === 'morph-in'
      ? 0
      : scale <= 1
        ? Math.max(0, 1 - translateY / 300)
        : 1;

  // Controls hidden when zoomed
  const controlsOpacity = phase === 'open' && !isZoomed ? bgOpacity : phase === 'open' && isZoomed ? 0 : 0;

  // Image transform
  const imgTransform = phase === 'morph-in' && sourceRect
    ? getMorphStyle()
    : phase === 'closing' && sourceRect
      ? { ...getMorphStyle(), transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease' }
      : {};

  const viewer = (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{
        zIndex: 99999,
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        transition: isDragging ? 'none' : 'background-color 0.3s ease',
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => { if (e.target === containerRef.current && !isZoomed) close(); }}
    >
      {/* Close button — hidden when zoomed */}
      <button
        onClick={close}
        className="absolute top-3 right-3 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-md active:scale-90"
        style={{
          zIndex: 100000,
          opacity: controlsOpacity,
          transition: 'opacity 0.2s ease',
          pointerEvents: controlsOpacity > 0 ? 'auto' : 'none',
        }}
      >
        <X size={22} />
      </button>

      {/* Counter — hidden when zoomed */}
      {images.length > 1 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/40 text-white/90 text-xs font-medium backdrop-blur-md"
          style={{
            zIndex: 100000,
            opacity: controlsOpacity,
            transition: 'opacity 0.2s ease',
            pointerEvents: 'none',
          }}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <img
        ref={imgRef}
        src={images[currentIndex]}
        alt=""
        className="will-change-transform"
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          transform: phase === 'morph-in' && sourceRect
            ? (imgTransform as React.CSSProperties).transform
            : phase === 'closing' && sourceRect
              ? (getMorphStyle()).transform
              : `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          opacity: phase === 'closing' && !sourceRect ? 0 : 1,
          transition: phase === 'morph-in'
            ? 'none'
            : phase === 'closing'
              ? 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease'
              : isDragging
                ? 'none'
                : 'transform 0.25s ease',
        }}
      />

      {/* Dots — hidden when zoomed */}
      {images.length > 1 && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5"
          style={{
            zIndex: 100000,
            opacity: controlsOpacity,
            transition: 'opacity 0.2s ease',
            pointerEvents: 'none',
          }}
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
