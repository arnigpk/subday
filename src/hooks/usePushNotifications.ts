import { useCallback, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { toast } from 'sonner';
import { messaging } from '@/lib/firebase';

const VAPID_KEY =
  'BAxmCxcPMx7w6yFuKKijoeRs1Z9Fo78avizGN6BghC3UQUqx8bglJNLQFzpkyxxHsPIMpx0qASRZmjoer-Pf13o';

export function usePushNotifications() {
  // Foreground messages listener
  useEffect(() => {
    if (!messaging) return;
    const unsub = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message:', payload);
      const title = payload?.notification?.title || 'Уведомление';
      const body = payload?.notification?.body || '';
      toast(title, { description: body });
    });
    return () => unsub();
  }, []);

  const requestPermissionAndToken = useCallback(async (): Promise<string | null> => {
    try {
      if (!messaging) {
        toast.error('Push не поддерживается в этом браузере');
        return null;
      }

      if (!('Notification' in window)) {
        toast.error('Браузер не поддерживает уведомления');
        return null;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Разрешение на уведомления не выдано');
        return null;
      }

      // Register service worker explicitly to ensure it's ready
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (token) {
        console.log('[FCM] Token:', token);
        toast.success('FCM токен получен (см. консоль)');
        return token;
      }

      toast.error('Не удалось получить FCM токен');
      return null;
    } catch (err) {
      console.error('[FCM] Error getting token:', err);
      toast.error('Ошибка получения токена');
      return null;
    }
  }, []);

  return { requestPermissionAndToken };
}
