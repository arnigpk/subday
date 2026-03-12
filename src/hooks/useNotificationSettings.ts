import { useState, useEffect, useCallback } from 'react';

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

  // Sync push state with browser permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setSettings(prev => {
        const next = { ...prev, pushEnabled: true };
        saveSettings(next);
        return next;
      });
    }
  }, []);

  const update = useCallback((partial: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const togglePush = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'granted') {
      // Can't revoke browser permission, but we toggle our flag
      update({ pushEnabled: !loadSettings().pushEnabled });
      return true;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      update({ pushEnabled: true });
      return true;
    }
    return false;
  }, [update]);

  return { settings, update, togglePush };
}
