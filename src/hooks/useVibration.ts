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

  const vibrate = useCallback((pattern: number | number[] = 500) => {
    if (isNative) {
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

  /** Light selection tap - for tab/menu switching */
  const vibrateSelection = useCallback(() => {
    if (isNative) {
      Haptics.selectionStart().catch(() => {
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      });
      return;
    }
    if (tgHaptic) {
      tgHaptic.selectionChanged?.();
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(15); } catch {}
    }
  }, [isNative, tgHaptic]);

  /** Light impact - subtle feedback */
  const vibrateLight = useCallback(() => {
    if (isNative) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      return;
    }
    if (tgHaptic) {
      tgHaptic.impactOccurred('light');
      return;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(25); } catch {}
    }
  }, [isNative, tgHaptic]);

  /**
   * Soft ramp-up buzz for the splash/preloader — starts gentle (Light) and
   * builds up power (→ Medium → Heavy) over ~1s. Change the sequence below to
   * tweak how the preloader vibration feels.
   */
  const vibratePreloader = useCallback(() => {
    // Плавное «бзыыык»: частые импульсы, плотность и интенсивность которых
    // нарастают к концу, поэтому отдельные тычки сливаются в один непрерывный
    // разгон от мягкого к жёсткому. Меняй TOTAL/START_GAP/END_GAP ниже, чтобы
    // подкрутить длительность и «слитность» вибрации.
    const TOTAL = 850;       // общая длительность разгона, мс
    const START_GAP = 60;    // интервал в начале (реже = мягче)
    const END_GAP = 22;      // интервал в конце (чаще = «бзыыык»)

    if (isNative || tgHaptic) {
      let t = 0;
      while (t < TOTAL) {
        const p = t / TOTAL; // прогресс 0..1
        const at = t;
        if (isNative) {
          const style = p < 0.4 ? ImpactStyle.Light : p < 0.75 ? ImpactStyle.Medium : ImpactStyle.Heavy;
          setTimeout(() => Haptics.impact({ style }).catch(() => {}), at);
        } else if (tgHaptic) {
          const style = p < 0.4 ? 'light' : p < 0.75 ? 'medium' : 'heavy';
          setTimeout(() => tgHaptic.impactOccurred(style as 'light' | 'medium' | 'heavy'), at);
        }
        // Интервал плавно сокращается START_GAP → END_GAP (плотность растёт).
        t += START_GAP - (START_GAP - END_GAP) * p;
      }
      return;
    }
    if ('vibrate' in navigator) {
      // Разгон: время вибрации растёт, паузы сокращаются (soft → «бзыыык»),
      // финальный длинный импульс — жёсткий «-к».
      try {
        navigator.vibrate([15, 70, 20, 60, 30, 50, 45, 40, 60, 30, 80, 20, 110, 12, 160]);
      } catch {}
    }
  }, [isNative, tgHaptic]);

  return {
    vibrate,
    vibrateSuccess,
    vibrateShort,
    vibrateError,
    vibrateSelection,
    vibrateLight,
    vibratePreloader,
  };
}
