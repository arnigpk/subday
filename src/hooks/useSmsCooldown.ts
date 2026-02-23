import { useState, useEffect, useCallback, useRef } from 'react';

export function useSmsCooldown(cooldownSeconds = 59) {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startCooldown = useCallback((seconds?: number) => {
    const secs = seconds ?? cooldownSeconds;
    setRemaining(secs);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [cooldownSeconds]);

  return { remaining, isCoolingDown: remaining > 0, startCooldown };
}
