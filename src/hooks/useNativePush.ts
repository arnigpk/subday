import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { saveDeviceToken, isPushOptedOut } from '@/lib/pushToken';

/**
 * Native push notifications hook (iOS/Android via Capacitor).
 *
 * - initialize(): checks permission, requests if needed, registers with APNs/FCM.
 * - Saves the FCM token to the `device_tokens` table.
 * - When a push arrives while the app is in the FOREGROUND, the OS does NOT show
 *   a system notification (it delivers the payload to JS instead). So we present
 *   a Local Notification ourselves — this way the push is visible in the tray
 *   whether the app is open, backgrounded, or closed. Works on Android and iOS.
 *
 * Safe no-op on the web — use FCM web SDK separately for browser pushes.
 */

// Показывает системное уведомление из полученного в foreground пуша.
async function presentForegroundNotification(title: string, body: string) {
  try {
    // На Android локальные уведомления идут в свой канал — создаём такой же
    // высокоприоритетный канал, как для пушей (звук + вибрация + heads-up).
    if (Capacitor.getPlatform() === 'android') {
      try {
        await LocalNotifications.createChannel({
          id: 'default',
          name: 'Уведомления',
          description: 'Пуш-уведомления subday',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
        });
      } catch { /* канал уже есть */ }
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483647),
          title,
          body,
          channelId: 'default',
          schedule: { at: new Date(Date.now() + 200) },
        },
      ],
    });
  } catch (e) {
    console.warn('[NativePush] presentForegroundNotification failed', e);
  }
}
export function useNativePush() {
  const listenersAttached = useRef(false);

  // Attach foreground / registration listeners once
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || listenersAttached.current) return;
    listenersAttached.current = true;

    const platform = Capacitor.getPlatform();

    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[NativePush] FCM Token:', token.value);
      // saveDeviceToken игнорируется, если пользователь выключил push (opt-out).
      await saveDeviceToken(token.value, platform);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[NativePush] Registration error:', err);
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        const title = notification.title || 'subday';
        const body = notification.body || '';
        // Приложение открыто → ОС не покажет пуш сама. Показываем системное
        // уведомление вручную, чтобы оно было видно в шторке (Android + iOS).
        presentForegroundNotification(title, body);
      }
    );

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[NativePush] Action performed:', action);
    });

    return () => {
      PushNotifications.removeAllListeners();
      listenersAttached.current = false;
    };
  }, []);

  const initialize = useCallback(async (): Promise<'granted' | 'denied' | 'unsupported'> => {
    if (!Capacitor.isNativePlatform()) return 'unsupported';
    try {
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== 'granted') return 'denied';

      // Локальные уведомления нужны, чтобы показать пуш, пришедший в foreground.
      // На iOS у них своё разрешение; на Android покрывается POST_NOTIFICATIONS.
      try {
        const ln = await LocalNotifications.checkPermissions();
        if (ln.display === 'prompt' || ln.display === 'prompt-with-rationale') {
          await LocalNotifications.requestPermissions();
        }
      } catch { /* ignore */ }

      // Пользователь явно выключил push в приложении — не регистрируемся,
      // чтобы не возвращать токен и не слать ему уведомления.
      if (isPushOptedOut()) return 'granted';

      // Android 8+: звук/вибрация/heads-up задаются КАНАЛОМ, а не пушем.
      // Создаём канал 'default' с высокой важностью и вибрацией — на него
      // ссылается FCM-payload (channel_id: 'default'). Идемпотентно.
      if (Capacitor.getPlatform() === 'android') {
        try {
          await PushNotifications.createChannel({
            id: 'default',
            name: 'Уведомления',
            description: 'Пуш-уведомления subday',
            importance: 5, // IMPORTANCE_HIGH → всплывающий баннер
            visibility: 1,
            sound: 'default',
            vibration: true,
            lights: true,
          });
        } catch (e) {
          console.warn('[NativePush] createChannel failed', e);
        }
      }

      await PushNotifications.register();
      return 'granted';
    } catch (err) {
      console.error('[NativePush] initialize error:', err);
      return 'denied';
    }
  }, []);

  return { initialize };
}
