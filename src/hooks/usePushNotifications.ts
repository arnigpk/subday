import { useCallback, useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { toast } from 'sonner';
import { messaging } from '@/lib/firebase';

const VAPID_KEY =
  'BAxmCxcPMx7w6yFuKKijoeRs1Z9Fo78avizGN6BghC3UQUqx8bglJNLQFzpkyxxHsPIMpx0qASRZmjoer-Pf13o';

export function usePushNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      if (!messaging) {
        const msg = 'Push не поддерживается в этом браузере (messaging is null)';
        setError(msg);
        toast.error(msg);
        return null;
      }

      if (!('Notification' in window)) {
        const msg = 'Браузер не поддерживает Notification API';
        setError(msg);
        toast.error(msg);
        return null;
      }

      if (!('serviceWorker' in navigator)) {
        const msg = 'Service Worker не поддерживается';
        setError(msg);
        toast.error(msg);
        return null;
      }

      const permission = await Notification.requestPermission();
      console.log('[FCM] Notification permission:', permission);
      if (permission !== 'granted') {
        const msg = `Разрешение на уведомления не выдано (${permission})`;
        setError(msg);
        toast.error(msg);
        return null;
      }

      // Register / get the SW for FCM
      let swReg: ServiceWorkerRegistration;
      try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });
        console.log('[FCM] SW registered:', swReg);
        await navigator.serviceWorker.ready;
      } catch (swErr) {
        const msg = `Ошибка регистрации Service Worker: ${(swErr as Error)?.message || swErr}`;
        console.error('[FCM]', msg, swErr);
        setError(msg);
        toast.error(msg);
        return null;
      }

      try {
        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (fcmToken) {
          console.log('[FCM] Token:', fcmToken);
          setToken(fcmToken);
          toast.success('FCM токен получен');
          return fcmToken;
        }

        const msg = 'getToken вернул пустой токен';
        setError(msg);
        toast.error(msg);
        return null;
      } catch (tokenErr) {
        const msg = `Ошибка getToken: ${(tokenErr as Error)?.message || tokenErr}`;
        console.error('[FCM]', msg, tokenErr);
        setError(msg);
        toast.error(msg);
        return null;
      }
    } catch (err) {
      const msg = `Неожиданная ошибка: ${(err as Error)?.message || err}`;
      console.error('[FCM]', msg, err);
      setError(msg);
      toast.error(msg);
      return null;
    }
  }, []);

  return { requestPermissionAndToken, token, error };
}
