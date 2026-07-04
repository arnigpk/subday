import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getToken } from 'firebase/messaging';
import { messaging } from '@/lib/firebase';
import {
  saveDeviceToken,
  deleteThisDeviceToken,
  isPushOptedOut,
  setPushOptedOut,
} from '@/lib/pushToken';

const STORAGE_KEY = 'subday_notification_settings';
const VAPID_KEY =
  'BAxmCxcPMx7w6yFuKKijoeRs1Z9Fo78avizGN6BghC3UQUqx8bglJNLQFzpkyxxHsPIMpx0qASRZmjoer-Pf13o';

export interface NotificationSettings {
  pushEnabled: boolean;
  subflowSoundEnabled: boolean;
  vibrationEnabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  pushEnabled: false,
  subflowSoundEnabled: true,
  vibrationEnabled: true,
};

function loadSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: NotificationSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

// Check if system actually granted notification permission
async function checkSystemPushGranted(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const r = await PushNotifications.checkPermissions();
      return r.receive === 'granted';
    } catch { return false; }
  }
  if (typeof Notification === 'undefined') return false;
  return Notification.permission === 'granted';
}

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const [systemPushGranted, setSystemPushGranted] = useState(false);

  // Sync push state with real system permission
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const granted = await checkSystemPushGranted();
      if (cancelled) return;
      setSystemPushGranted(granted);
      // Эффективное состояние тумблера = разрешение ОС выдано И пользователь не отключил push сам.
      // - Если пользователь выключил (opt-out) — держим ВЫКЛ, не навязываемся.
      // - Если НЕ выключал и разрешение есть — включаем автоматически.
      const optedOut = isPushOptedOut();
      const effective = granted && !optedOut;
      setSettings(prev => {
        if (prev.pushEnabled !== effective) {
          const next = { ...prev, pushEnabled: effective };
          saveSettings(next);
          return next;
        }
        return prev;
      });
    };
    sync();

    // Re-check when window regains focus (user may have changed it in OS settings)
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);

    // ВАЖНО: слушатель 'registration' (сохранение FCM-токена) живёт ТОЛЬКО в
    // useNativePush (глобально, через PermissionsBootstrap). Здесь свои слушатели
    // НЕ добавляем и removeAllListeners НЕ вызываем — иначе при размонтировании
    // страницы убивались чужие слушатели, и Android-токен переставал сохраняться.

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const update = useCallback((partial: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const togglePush = useCallback(async (): Promise<'granted' | 'denied' | 'toggled' | 'blocked'> => {
    const turningOn = !loadSettings().pushEnabled;

    // --- Пользователь ВЫКЛЮЧАЕТ push ---
    if (!turningOn) {
      setPushOptedOut(true);       // явный отказ — держим выключенным при след. заходах
      update({ pushEnabled: false });
      await deleteThisDeviceToken(); // сервер перестаёт слать пуши на это устройство
      return 'toggled';
    }

    // --- Пользователь ВКЛЮЧАЕТ push ---
    // Снимаем opt-out. Разрешение выдано → регистрируемся заново (токен вернётся).
    setPushOptedOut(false);

    // Native flow
    if (Capacitor.isNativePlatform()) {
      try {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive === 'granted') {
          await PushNotifications.register();
          setSystemPushGranted(true);
          update({ pushEnabled: true });
          return 'granted';
        }
        // Разрешение не выдано. Не помечаем opt-out: если пользователь выдаст
        // разрешение в настройках ОС — тумблер включится сам при заходе.
        update({ pushEnabled: false });
        return permStatus.receive === 'denied' ? 'blocked' : 'denied';
      } catch {
        update({ pushEnabled: false });
        return 'denied';
      }
    }

    // Web flow
    if (typeof Notification === 'undefined') { update({ pushEnabled: false }); return 'denied'; }
    if (Notification.permission === 'denied') { update({ pushEnabled: false }); return 'blocked'; }

    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') { update({ pushEnabled: false }); return 'denied'; }
    }

    // Разрешение есть — получаем/обновляем FCM-токен.
    try {
      if (messaging && 'serviceWorker' in navigator) {
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
        if (fcmToken) await saveDeviceToken(fcmToken, 'web');
      }
    } catch (err) {
      console.error('FCM token error:', err);
    }
    setSystemPushGranted(true);
    update({ pushEnabled: true });
    return 'granted';
  }, [update]);

  return { settings, update, togglePush, systemPushGranted };
}
