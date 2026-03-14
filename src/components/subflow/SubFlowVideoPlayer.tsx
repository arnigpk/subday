import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';

interface SubFlowVideoPlayerProps {
  src: string;
  className?: string;
}

const getMimeTypeFromSrc = (url: string): string => {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.webm')) return 'video/webm';
  if (cleanUrl.endsWith('.mov')) return 'video/quicktime';
  if (cleanUrl.endsWith('.m4v')) return 'video/mp4';
  return 'video/mp4';
};

const formatRemainingTime = (value: number): string => {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function SubFlowVideoPlayer({ src, className = '' }: SubFlowVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [showNativeControls, setShowNativeControls] = useState(false);

  const configureVideoElement = useCallback((video: HTMLVideoElement, muted: boolean) => {
    video.muted = muted;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    // setAttribute ensures HTML attributes are present (important for mobile Safari)
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
  }, []);

  const playVideo = useCallback(async (fromUserGesture: boolean) => {
    const video = videoRef.current;
    if (!video) return false;

    // For maximum cross-browser compatibility, always start muted first
    if (fromUserGesture) {
      setIsMuted(true);
      configureVideoElement(video, true);
    } else {
      configureVideoElement(video, true);
    }

    try {
      await video.play();
      setShowPlayButton(false);
      return true;
    } catch (err) {
      console.log('Video play blocked or failed:', err);
      setIsPlaying(false);
      setShowPlayButton(true);

      // If manual play fails, expose native controls as final fallback
      if (fromUserGesture) {
        setShowNativeControls(true);
      }
      return false;
    }
  }, [configureVideoElement]);

  // Reset and prepare video when source changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setIsPlaying(false);
    setShowPlayButton(false);
    setShowNativeControls(false);
    setIsMuted(true);

    configureVideoElement(video, true);
    video.load();
  }, [src, configureVideoElement]);

  // IntersectionObserver for autoplay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          void playVideo(false);
        } else {
          video.pause();
          setIsPlaying(false);
          setIsMuted(true);
          video.muted = true;
        }
      },
      { threshold: [0.2, 0.35, 0.6] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [playVideo]);

  // Sync muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Manual play for blocked autoplay
  const handlePlayTap = useCallback(async (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
    await playVideo(true);
  }, [playVideo]);

  // Tap video area to toggle play/pause
  const handleVideoTap = useCallback(async (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    const video = videoRef.current;
    if (!video) return;

    if (showPlayButton) {
      await playVideo(true);
      return;
    }

    if (video.paused) {
      const played = await playVideo(true);
      if (!played) setShowNativeControls(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [showPlayButton, playVideo]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(prev => !prev);
  }, []);

  // Listen to video events for accurate state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setShowPlayButton(false);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      setIsPlaying(false);
      setShowPlayButton(true);
      setShowNativeControls(true);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onPointerUp={(e) => { void handleVideoTap(e); }}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-[28rem] object-contain bg-black/5 dark:bg-white/5 rounded-sm"
        loop
        muted={isMuted}
        playsInline
        autoPlay
        controls={showNativeControls}
        preload="auto"
      >
        <source src={src} type={getMimeTypeFromSrc(src)} />
      </video>

      {/* Play button overlay when autoplay is blocked */}
      {showPlayButton && !isPlaying && (
        <button
          type="button"
          onPointerUp={(e) => { void handlePlayTap(e); }}
          className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all active:bg-black/30"
          aria-label="Воспроизвести видео"
        >
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play size={28} className="text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Mute toggle */}
      <button
        type="button"
        onClick={toggleMute}
        className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 backdrop-blur-sm text-white/90 transition-all hover:bg-black/70 active:scale-90"
        aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
      >
        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
}
