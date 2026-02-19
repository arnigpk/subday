import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Hook for triggering phone vibration feedback.
 * Priority: 1) Capacitor Haptics (native app) 2) Telegram HapticFeedback (Mini App) 3) navigator.vibrate() (web)
 */
export function useVibration() {
  const isNative = Capacitor.isNativePlatform();
  const tgHaptic = window.Telegram?.WebApp?.HapticFeedback;

  const vibrate = useCallback((pattern: number | number[] = 200) => {
    if (isNative) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      return;
    }
    if (tgHaptic) {
      tgHaptic.impactOccurred('medium');
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }, [isNative, tgHaptic]);

  const vibrateSuccess = useCallback(() => {
    if (isNative) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      return;
    }
    if (tgHaptic) {
      tgHaptic.notificationOccurred('success');
      return;
    }
    vibrate([100, 50, 100]);
  }, [isNative, tgHaptic, vibrate]);

  const vibrateShort = useCallback(() => {
    if (isNative) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      return;
    }
    if (tgHaptic) {
      tgHaptic.impactOccurred('light');
      return;
    }
    vibrate(50);
  }, [isNative, tgHaptic, vibrate]);

  const vibrateError = useCallback(() => {
    if (isNative) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      return;
    }
    if (tgHaptic) {
      tgHaptic.notificationOccurred('error');
      return;
    }
    vibrate([200, 100, 200]);
  }, [isNative, tgHaptic, vibrate]);

  return {
    vibrate,
    vibrateSuccess,
    vibrateShort,
    vibrateError,
  };
}
