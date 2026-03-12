import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Hook for triggering phone vibration feedback.
 * Priority: 1) Capacitor Haptics (native app) 2) Telegram HapticFeedback (Mini App) 3) navigator.vibrate() (web)
 * 
 * All patterns are tuned for STRONG, noticeable feedback.
 */
export function useVibration() {
  const isNative = Capacitor.isNativePlatform();
  const tgHaptic = window.Telegram?.WebApp?.HapticFeedback;

  const vibrate = useCallback((pattern: number | number[] = 500) => {
    if (isNative) {
      // Triple heavy impact for maximum feel
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 100);
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 200);
      return;
    }
    if (tgHaptic) {
      tgHaptic.impactOccurred('heavy');
      setTimeout(() => tgHaptic.impactOccurred('heavy'), 100);
      setTimeout(() => tgHaptic.impactOccurred('heavy'), 200);
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(typeof pattern === 'number' ? [pattern, 80, pattern] : pattern); } catch {}
    }
  }, [isNative, tgHaptic]);

  const vibrateSuccess = useCallback(() => {
    if (isNative) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      // Double tap for emphasis
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 150);
      return;
    }
    if (tgHaptic) {
      tgHaptic.notificationOccurred('success');
      setTimeout(() => tgHaptic.impactOccurred('heavy'), 150);
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate([150, 80, 200, 80, 150]); } catch {}
    }
  }, [isNative, tgHaptic]);

  const vibrateShort = useCallback(() => {
    if (isNative) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      return;
    }
    if (tgHaptic) {
      tgHaptic.impactOccurred('medium');
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(100); } catch {}
    }
  }, [isNative, tgHaptic]);

  const vibrateError = useCallback(() => {
    if (isNative) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 200);
      return;
    }
    if (tgHaptic) {
      tgHaptic.notificationOccurred('error');
      setTimeout(() => tgHaptic.impactOccurred('heavy'), 200);
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate([300, 100, 300, 100, 300]); } catch {}
    }
  }, [isNative, tgHaptic]);

  return {
    vibrate,
    vibrateSuccess,
    vibrateShort,
    vibrateError,
  };
}
