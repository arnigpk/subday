import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema } from '@capacitor/push-notifications';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Native push notifications hook (iOS/Android via Capacitor).
 *
 * - initialize(): checks permission, requests if needed, registers with APNs/FCM.
 * - Saves the FCM token to the `device_tokens` table.
 * - Shows a toast when a push arrives while the app is in the foreground.
 *
 * Safe no-op on the web — use FCM web SDK separately for browser pushes.
 */
export function useNativePush() {
  const listenersAttached = useRef(false);

  // Attach foreground / registration listeners once
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || listenersAttached.current) return;
    listenersAttached.current = true;

    const platform = Capacitor.getPlatform();

    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[NativePush] FCM Token:', token.value);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await (supabase.from('device_tokens') as any).upsert(
          {
            user_id: user.id,
            token: token.value,
            platform,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' }
        );
      } catch (err) {
        console.error('[NativePush] Failed to save token:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[NativePush] Registration error:', err);
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        const title = notification.title || 'Уведомление';
        const body = notification.body || '';
        toast(title, { description: body });
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
      await PushNotifications.register();
      return 'granted';
    } catch (err) {
      console.error('[NativePush] initialize error:', err);
      return 'denied';
    }
  }, []);

  return { initialize };
}
