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
  const [isGesturing, setIsGesturing] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  // Pinch state
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const pinchStartTxRef = useRef(0);
  const pinchStartTyRef = useRef(0);
  const pinchMidStartRef = useRef<{ x: number; y: number } | null>(null);

  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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

  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'));
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

  const getTouchDist = (t: React.TouchList) => {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchMid = (t: React.TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setIsGesturing(true);
      pinchStartDistRef.current = getTouchDist(e.touches);
      pinchStartScaleRef.current = scale;
      pinchStartTxRef.current = translateX;
      pinchStartTyRef.current = translateY;
      pinchMidStartRef.current = getTouchMid(e.touches);
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      isDraggingRef.current = false;
      setIsGesturing(true);
      if (scale > 1) {
        panStartRef.current = { x: translateX, y: translateY };
      }
    }
  }, [scale, translateX, translateY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    // Pinch zoom with focal point tracking
    if (e.touches.length === 2 && pinchStartDistRef.current !== null && pinchMidStartRef.current) {
      const dist = getTouchDist(e.touches);
      const mid = getTouchMid(e.touches);
      const ratio = dist / pinchStartDistRef.current;
      const newScale = Math.min(4, Math.max(0.5, pinchStartScaleRef.current * ratio));

      // Track midpoint movement so zoom follows fingers
      const midDx = mid.x - pinchMidStartRef.current.x;
      const midDy = mid.y - pinchMidStartRef.current.y;

      if (newScale <= 1) {
        setScale(newScale);
        setTranslateX(0);
        setTranslateY(0);
      } else {
        setScale(newScale);
        setTranslateX(pinchStartTxRef.current + midDx);
        setTranslateY(pinchStartTyRef.current + midDy);
      }
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
      pinchMidStartRef.current = null;
      // Snap back if below 1x
      if (scale < 1) {
        setIsGesturing(false);
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
      } else {
        // Small delay to allow snap animation
        setTimeout(() => setIsGesturing(false), 50);
      }
      return;
    }

    if (!touchStartRef.current) return;

    const now = Date.now();
    const dY = translateY;
    const dX = translateX;

    // Double-tap
    if (!isDraggingRef.current || (Math.abs(dX) < 5 && Math.abs(dY) < 5)) {
      const gap = now - lastTapRef.current;
      if (gap < 300 && gap > 0) {
        if (scale > 1) resetTransform();
        else { setScale(2); setTranslateX(0); setTranslateY(0); }
        lastTapRef.current = 0;
        touchStartRef.current = null;
        setIsGesturing(false);
        return;
      }
      lastTapRef.current = now;
    }

    if (scale <= 1) {
      if (dY > 100) { setIsGesturing(false); close(); return; }
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
    setTimeout(() => setIsGesturing(false), 50);
  }, [scale, translateX, translateY, currentIndex, images.length, close, resetTransform]);

  useEffect(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, [currentIndex]);

  const isZoomed = scale > 1;
  const bgOpacity = phase === 'closing' ? 0
    : phase === 'morph-in' ? 0
    : scale <= 1 ? Math.max(0, 1 - translateY / 300)
    : 1;

  const controlsOpacity = phase === 'open' && !isZoomed ? bgOpacity : 0;

  const getImageTransform = () => {
    if (phase === 'morph-in' && sourceRect) {
      return (getMorphStyle() as React.CSSProperties).transform as string;
    }
    if (phase === 'closing' && sourceRect) {
      return (getMorphStyle() as React.CSSProperties).transform as string;
    }
    return `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };

  const getImageTransition = () => {
    if (phase === 'morph-in') return 'none';
    if (phase === 'closing') return 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease';
    if (isGesturing) return 'none';
    return 'transform 0.25s ease';
  };

  const viewer = (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{
        zIndex: 99999,
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        transition: isGesturing ? 'none' : 'background-color 0.3s ease',
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => { if (e.target === containerRef.current && !isZoomed) close(); }}
    >
      <button
        onClick={close}
        className="absolute right-4 p-3 rounded-full bg-black/50 text-white backdrop-blur-md active:scale-90"
        style={{
          zIndex: 100000,
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          opacity: controlsOpacity,
          transition: 'opacity 0.2s ease',
          pointerEvents: controlsOpacity > 0 ? 'auto' : 'none',
        }}
      >
        <X size={22} />
      </button>

      {images.length > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/40 text-white/90 text-xs font-medium backdrop-blur-md"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 18px)',
            zIndex: 100000,
            opacity: controlsOpacity,
            transition: 'opacity 0.2s ease',
            pointerEvents: 'none',
          }}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}

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
          transform: getImageTransform(),
          opacity: phase === 'closing' && !sourceRect ? 0 : 1,
          transition: getImageTransition(),
        }}
      />

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
