import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Volume2, VolumeX, Play, Loader2 } from 'lucide-react';

interface SubFlowVideoPlayerProps {
  src: string;
  className?: string;
}

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
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadSrc, setLoadSrc] = useState(false);
  const pauseIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remainingTimeLabel = useMemo(() => {
    const base = duration > 0 ? duration - currentTime : 0;
    return formatRemainingTime(base);
  }, [duration, currentTime]);

  const configureVideoElement = useCallback((video: HTMLVideoElement, muted: boolean) => {
    video.muted = muted;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
  }, []);

  const playVideo = useCallback(async (fromUserGesture: boolean) => {
    const video = videoRef.current;
    if (!video) return false;

    configureVideoElement(video, fromUserGesture ? true : true);
    if (fromUserGesture) setIsMuted(true);

    // Wait for readyState if not ready yet
    if (video.readyState < 3) {
      await new Promise<void>((resolve) => {
        const onReady = () => { video.removeEventListener('canplay', onReady); resolve(); };
        video.addEventListener('canplay', onReady);
        setTimeout(() => { video.removeEventListener('canplay', onReady); resolve(); }, 2000);
      });
    }

    // Retry logic: 3 attempts with 300ms delay
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await video.play();
        setShowPlayButton(false);
        return true;
      } catch (err) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 300));
        } else {
          console.log('Video play blocked after retries:', err);
          setIsPlaying(false);
          setShowPlayButton(true);
          if (fromUserGesture) setShowNativeControls(true);
          return false;
        }
      }
    }
    return false;
  }, [configureVideoElement]);

  // Lazy loading: load src when approaching viewport
  // Autoplay: play when visible, pause when not
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Preload observer: start loading video when within 500px of viewport
    const preloadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadSrc(true);
          preloadObserver.unobserve(entry.target);
        }
      },
      { rootMargin: '500px 0px' }
    );

    // Playback observer: autoplay when 35%+ visible
    const playbackObserver = new IntersectionObserver(
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

    preloadObserver.observe(el);
    playbackObserver.observe(el);

    return () => {
      preloadObserver.disconnect();
      playbackObserver.disconnect();
    };
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
      setIsPaused(true);
      if (pauseIndicatorTimer.current) clearTimeout(pauseIndicatorTimer.current);
      pauseIndicatorTimer.current = setTimeout(() => setIsPaused(false), 1500);
    }
  }, [showPlayButton, playVideo]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(prev => !prev);
  }, []);

  // Listen to video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { setIsPlaying(true); setShowPlayButton(false); setIsPaused(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onTimeUpdate = () => setCurrentTime(video.currentTime || 0);
    const onLoadedMetadata = () => { setDuration(video.duration || 0); setCurrentTime(video.currentTime || 0); };
    const onDurationChange = () => setDuration(video.duration || 0);
    const onError = () => { setIsPlaying(false); setShowPlayButton(true); setShowNativeControls(true); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('error', onError);
    };
  }, [loadSrc]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onPointerUp={(e) => { void handleVideoTap(e); }}
    >
      {loadSrc ? (
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
          // @ts-ignore — mobile browser compatibility attrs
          x5-video-player-type="h5"
          x5-video-orientation="portraint"
        />
      ) : (
        <div className="w-full max-h-[28rem] aspect-video bg-black/5 dark:bg-white/5 rounded-sm flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}

      {/* Remaining time */}
      {loadSrc && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] leading-none font-medium tracking-wide pointer-events-none">
          {remainingTimeLabel}
        </div>
      )}

      {/* Play button overlay when autoplay is blocked */}
      {showPlayButton && !isPlaying && loadSrc && (
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
      {loadSrc && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 backdrop-blur-sm text-white/90 transition-all hover:bg-black/70 active:scale-90"
          aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}
    </div>
  );
}
