import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { getToken } from 'firebase/messaging';
import { messaging } from '@/lib/firebase';

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

async function saveDeviceToken(token: string, platform: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase.from('device_tokens') as any).upsert(
      {
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    );
  } catch (err) {
    console.error('Failed to save device token:', err);
  }
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
      // If system permission is NOT granted — force pushEnabled to false everywhere
      setSettings(prev => {
        if (!granted && prev.pushEnabled) {
          const next = { ...prev, pushEnabled: false };
          saveSettings(next);
          return next;
        }
        if (granted && !prev.pushEnabled) {
          // Mirror granted state into the UI toggle
          const next = { ...prev, pushEnabled: true };
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

    // Native: register listeners for FCM token
    let removeListeners: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();
      PushNotifications.addListener('registration', (token) => {
        saveDeviceToken(token.value, platform);
      });
      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });
      removeListeners = () => { PushNotifications.removeAllListeners(); };
    }

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      if (removeListeners) removeListeners();
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
    // Native flow
    if (Capacitor.isNativePlatform()) {
      try {
        const permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'granted') {
          const current = loadSettings();
          update({ pushEnabled: !current.pushEnabled });
          return 'toggled';
        }
        if (permStatus.receive === 'denied') return 'blocked';

        const requestResult = await PushNotifications.requestPermissions();
        if (requestResult.receive === 'granted') {
          await PushNotifications.register();
          setSystemPushGranted(true);
          update({ pushEnabled: true });
          return 'granted';
        }
        return 'denied';
      } catch {
        return 'denied';
      }
    }

    // Web flow
    if (typeof Notification === 'undefined') return 'denied';

    if (Notification.permission === 'denied') return 'blocked';

    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return 'denied';
      // Get FCM token
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
    }

    // Already granted — just toggle the in-app preference
    const current = loadSettings();
    update({ pushEnabled: !current.pushEnabled });
    return 'toggled';
  }, [update]);

  return { settings, update, togglePush, systemPushGranted };
}
