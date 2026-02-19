import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Hook for triggering phone vibration feedback.
 * Uses Capacitor Haptics on native platforms (iOS/Android)
 * and falls back to navigator.vibrate() in the browser.
 */
export function useVibration() {
  const isNative = Capacitor.isNativePlatform();

  const vibrate = useCallback((pattern: number | number[] = 200) => {
    if (isNative) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      return;
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        console.log('Vibration not available:', error);
      }
    }
  }, [isNative]);

  const vibrateSuccess = useCallback(() => {
    if (isNative) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      return;
    }
    vibrate([100, 50, 100]);
  }, [isNative, vibrate]);

  const vibrateShort = useCallback(() => {
    if (isNative) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      return;
    }
    vibrate(50);
  }, [isNative, vibrate]);

  const vibrateError = useCallback(() => {
    if (isNative) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      return;
    }
    vibrate([200, 100, 200]);
  }, [isNative, vibrate]);

  return {
    vibrate,
    vibrateSuccess,
    vibrateShort,
    vibrateError,
  };
}
