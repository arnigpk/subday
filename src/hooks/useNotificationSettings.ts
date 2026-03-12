import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

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

// Save FCM token to database
async function saveDeviceToken(token: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await (supabase.from('device_tokens') as any).upsert(
      {
        user_id: user.id,
        token,
        platform: Capacitor.getPlatform(), // 'android' or 'ios'
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    );
  } catch (err) {
    console.error('Failed to save device token:', err);
  }
}

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);

  // Check current push permission status on mount and register token listener
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const checkPermission = async () => {
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
      };
      checkPermission();

      // Listen for FCM registration token
      PushNotifications.addListener('registration', (token) => {
        console.log('FCM token received:', token.value.slice(0, 20) + '...');
        saveDeviceToken(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });

      return () => {
        PushNotifications.removeAllListeners();
      };
    } else {
      const saved = loadSettings();
      setSettings(saved);
    }
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
          const current = loadSettings();
          update({ pushEnabled: !current.pushEnabled });
          return 'toggled';
        }

        const requestResult = await PushNotifications.requestPermissions();
        if (requestResult.receive === 'granted') {
          await PushNotifications.register();
          update({ pushEnabled: true });
          return 'granted';
        }

        return 'denied';
      } catch {
        return 'denied';
      }
    }

    const current = loadSettings();
    update({ pushEnabled: !current.pushEnabled });
    return 'toggled';
  }, [update]);

  return { settings, update, togglePush };
}
