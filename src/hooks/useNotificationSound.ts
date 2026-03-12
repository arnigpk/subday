import { useCallback, useRef } from 'react';

/**
 * Plays a subtle two-tone notification chime via Web Audio API.
 * Medium-low volume, non-intrusive.
 */
export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const play = useCallback(() => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = ctxRef.current;
      const now = ctx.currentTime;

      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      // Two gentle ascending tones
      playTone(880, now, 0.15);       // A5
      playTone(1174.66, now + 0.12, 0.18); // D6
    } catch {
      // Silent fail if audio not supported
    }
  }, []);

  return play;
}
