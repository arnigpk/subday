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
  // Первый кадр загружается рядом с видео при публикации (`<video>.poster.jpg`).
  // Показываем его сразу — картинка появляется мгновенно, пока видео ещё качается.
  // Если постера нет (старые посты) — браузер просто игнорирует ссылку, без ошибки.
  const posterSrc = useMemo(() => `${src.split('?')[0]}.poster.jpg`, [src]);
  const [posterFailed, setPosterFailed] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);
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
  const playAttemptRef = useRef(false);

  const remainingTimeLabel = useMemo(() => {
    const base = duration > 0 ? duration - currentTime : 0;
    return formatRemainingTime(base);
  }, [duration, currentTime]);

  const playVideo = useCallback(async (fromUserGesture: boolean) => {
    const video = videoRef.current;
    if (!video || playAttemptRef.current) return false;
    playAttemptRef.current = true;

    // Always ensure muted for autoplay compliance
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (fromUserGesture) setIsMuted(true);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const playPromise = video.play();
        if (playPromise) await playPromise;
        setShowPlayButton(false);
        setIsPlaying(true);
        playAttemptRef.current = false;
        return true;
      } catch (err) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 200));
        } else {
          console.log('Video play blocked after retries:', err);
          setIsPlaying(false);
          setShowPlayButton(true);
          if (fromUserGesture) setShowNativeControls(true);
          playAttemptRef.current = false;
          return false;
        }
      }
    }
    playAttemptRef.current = false;
    return false;
  }, []);

  // Lazy loading: load src when approaching viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const preloadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadSrc(true);
          preloadObserver.unobserve(entry.target);
        }
      },
      { rootMargin: '800px 0px' }
    );

    preloadObserver.observe(el);
    return () => preloadObserver.disconnect();
  }, []);

  // Autoplay when visible, pause when not
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !loadSrc) return;

    const playbackObserver = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          // Small delay to allow DOM to settle (especially in Telegram MiniApp)
          setTimeout(() => {
            if (video.paused) {
              void playVideo(false);
            }
          }, 100);
        } else {
          video.pause();
          setIsPlaying(false);
          setIsMuted(true);
          video.muted = true;
        }
      },
      { threshold: [0.2, 0.35, 0.6] }
    );

    playbackObserver.observe(el);
    return () => playbackObserver.disconnect();
  }, [playVideo, loadSrc]);

  // Try to play once video data is loaded (canplay event)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loadSrc) return;

    const onCanPlayThrough = () => {
      // Only autoplay if visible
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const visibleRatio = Math.max(0, Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0)) / rect.height;
      if (visibleRatio >= 0.35 && video.paused) {
        void playVideo(false);
      }
    };

    video.addEventListener('canplay', onCanPlayThrough);
    // Also try on loadeddata for Telegram WebView
    video.addEventListener('loadeddata', onCanPlayThrough);

    return () => {
      video.removeEventListener('canplay', onCanPlayThrough);
      video.removeEventListener('loadeddata', onCanPlayThrough);
    };
  }, [playVideo, loadSrc]);

  // Sync muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handlePlayTap = useCallback(async (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
    await playVideo(true);
  }, [playVideo]);

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
    const onError = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      // MEDIA_ERR_SRC_NOT_SUPPORTED (4) — браузер не умеет этот кодек/контейнер.
      // Кнопка «play» тут бесполезна: сколько ни жми, декодера всё равно нет.
      const code = videoRef.current?.error?.code;
      if (code === 4 || code === 3 /* MEDIA_ERR_DECODE */) {
        setIsUnsupported(true);
        setShowPlayButton(false);
        setShowNativeControls(false);
      } else {
        setShowPlayButton(true);
        setShowNativeControls(true);
      }
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => setIsBuffering(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('error', onError);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('error', onError);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
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
          poster={posterFailed ? undefined : posterSrc}
          className="w-full max-h-[28rem] object-contain bg-black/5 dark:bg-white/5 rounded-sm"
          loop
          muted
          playsInline
          autoPlay
          controls={showNativeControls}
          preload="auto"
          // @ts-ignore — mobile browser compatibility attrs
          x5-video-player-type="h5"
          x5-video-orientation="portraint"
        />
      ) : (
        /* До подгрузки видео показываем тот же постер — карточка не «прыгает»
           при замене заглушки на <video>, т.к. картинка уже та же самая. */
        <div className="relative w-full max-h-[28rem] aspect-video bg-black/5 dark:bg-white/5 rounded-sm overflow-hidden">
          {!posterFailed && (
            <img
              src={posterSrc}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-contain"
              onError={() => setPosterFailed(true)}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Формат не поддерживается этим браузером (частый случай: снятое на
          iPhone видео в HEVC/H.265 не декодируется в Android WebView).
          Показываем постер и честное объяснение вместо вечного спиннера. */}
      {isUnsupported && loadSrc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-[2px] rounded-sm px-4">
          <p className="text-white text-sm font-medium text-center">Видео не открывается на этом устройстве</p>
          <p className="text-white/70 text-xs text-center">Формат не поддерживается браузером</p>
        </div>
      )}

      {/* Remaining time + buffering indicator */}
      {loadSrc && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 pointer-events-none">
          {isBuffering && (
            <div className="p-1 rounded-full bg-black/55 backdrop-blur-sm">
              <Loader2 size={12} className="text-white animate-spin" />
            </div>
          )}
          <div className="px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] leading-none font-medium tracking-wide">
            {remainingTimeLabel}
          </div>
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
