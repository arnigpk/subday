import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const STORAGE_KEY = 'subday_notification_settings';

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

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);

  // Check current push permission status on mount
  useEffect(() => {
    const checkPermission = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const result = await PushNotifications.checkPermissions();
          if (result.receive === 'granted') {
            setSettings(prev => {
              const next = { ...prev, pushEnabled: true };
              saveSettings(next);
              return next;
            });
          }
        } catch {}
      } else {
        // Web fallback: just restore saved state
        const saved = loadSettings();
        setSettings(saved);
      }
    };
    checkPermission();
  }, []);

  const update = useCallback((partial: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const togglePush = useCallback(async (): Promise<'granted' | 'denied' | 'toggled'> => {
    if (Capacitor.isNativePlatform()) {
      try {
        const permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'granted') {
          // Already granted — just toggle our internal flag
          const current = loadSettings();
          update({ pushEnabled: !current.pushEnabled });
          return 'toggled';
        }

        // Request native permission
        const requestResult = await PushNotifications.requestPermissions();
        if (requestResult.receive === 'granted') {
          // Register for push notifications
          await PushNotifications.register();
          update({ pushEnabled: true });
          return 'granted';
        }

        return 'denied';
      } catch {
        return 'denied';
      }
    }

    // Web/PWA fallback — simple toggle (no browser Notification API)
    const current = loadSettings();
    update({ pushEnabled: !current.pushEnabled });
    return 'toggled';
  }, [update]);

  return { settings, update, togglePush };
}
