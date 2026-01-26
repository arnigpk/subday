import { useCallback } from 'react';

/**
 * Hook for triggering phone vibration feedback.
 * Uses the Vibration API which is supported on most mobile browsers.
 */
export function useVibration() {
  const vibrate = useCallback((pattern: number | number[] = 200) => {
    // Check if vibration is supported
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        console.log('Vibration not available:', error);
      }
    }
  }, []);

  /**
   * Short vibration for success feedback
   */
  const vibrateSuccess = useCallback(() => {
    vibrate([100, 50, 100]); // Double tap pattern
  }, [vibrate]);

  /**
   * Single short vibration for simple feedback
   */
  const vibrateShort = useCallback(() => {
    vibrate(50);
  }, [vibrate]);

  /**
   * Longer vibration for error feedback
   */
  const vibrateError = useCallback(() => {
    vibrate([200, 100, 200]); // Strong double tap
  }, [vibrate]);

  return {
    vibrate,
    vibrateSuccess,
    vibrateShort,
    vibrateError,
  };
}
