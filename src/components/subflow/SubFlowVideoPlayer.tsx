import { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';

interface SubFlowVideoPlayerProps {
  src: string;
  className?: string;
}

export function SubFlowVideoPlayer({ src, className = '' }: SubFlowVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Try to play video — if blocked by browser, show play button
  const tryPlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      // Ensure muted for autoplay policy compliance
      video.muted = true;
      video.playsInline = true;
      // setAttribute ensures the HTML attribute is present (Safari checks this)
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      await video.play();
      setIsPlaying(true);
      setShowPlayButton(false);
    } catch (err) {
      console.log('Autoplay blocked, showing play button:', err);
      setIsPlaying(false);
      setShowPlayButton(true);
    }
  }, []);

  // IntersectionObserver for autoplay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;

        if (entry.isIntersecting) {
          tryPlay();
        } else {
          video.pause();
          setIsPlaying(false);
          // Mute when scrolled away
          setIsMuted(true);
          if (video) video.muted = true;
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [tryPlay]);

  // Sync muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Handle manual play tap (for when autoplay is blocked)
  const handlePlayTap = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;

    setHasUserInteracted(true);

    try {
      // First attempt muted (guaranteed to work after user gesture)
      video.muted = true;
      await video.play();
      setIsPlaying(true);
      setShowPlayButton(false);
    } catch (err) {
      console.error('Play failed even after user gesture:', err);
    }
  }, []);

  // Handle tap on video area to toggle play/pause
  const handleVideoTap = useCallback((e: React.MouseEvent) => {
    // Don't intercept if clicking the mute button
    if ((e.target as HTMLElement).closest('button')) return;
    
    const video = videoRef.current;
    if (!video) return;

    if (showPlayButton) {
      handlePlayTap(e);
      return;
    }

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [showPlayButton, handlePlayTap]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(prev => !prev);
  }, []);

  // Listen to video events for accurate state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { setIsPlaying(true); setShowPlayButton(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onClick={handleVideoTap}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-[28rem] object-contain bg-black/5 dark:bg-white/5 rounded-sm"
        loop
        muted
        playsInline
        // @ts-ignore — webkit attribute for older iOS Safari
        webkit-playsinline=""
        preload="auto"
        // poster helps Safari show first frame before play
        poster=""
      />

      {/* Play button overlay when autoplay is blocked */}
      {showPlayButton && !isPlaying && (
        <button
          onClick={handlePlayTap}
          className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all active:bg-black/30"
        >
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play size={28} className="text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 backdrop-blur-sm text-white/90 transition-all hover:bg-black/70 active:scale-90"
      >
        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
}
