import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { getToken } from 'firebase/messaging';
import { messaging } from '@/lib/firebase';
import { useNativePush } from '@/hooks/useNativePush';

const VAPID_KEY =
  'BAxmCxcPMx7w6yFuKKijoeRs1Z9Fo78avizGN6BghC3UQUqx8bglJNLQFzpkyxxHsPIMpx0qASRZmjoer-Pf13o';

const PUSH_REQUESTED_KEY = 'permissions_push_requested';
const GEO_REQUESTED_KEY = 'permissions_geo_requested';
const CAMERA_REQUESTED_KEY = 'permissions_camera_requested';

// ---------- DB helpers ----------

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
    console.error('[Permissions] Failed to save device token:', err);
  }
}

async function setGeoEnabledInProfile(enabled: boolean) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase.from('profiles') as any)
      .update({ geo_notifications_enabled: enabled })
      .eq('user_id', user.id);
  } catch (err) {
    console.error('[Permissions] Failed to update geo flag:', err);
  }
}

// ---------- PUSH ----------

async function handlePushPermission() {
  const tg = (window as any).Telegram?.WebApp;

  // Telegram WebApp — no FCM, just request write access once
  if (tg?.requestWriteAccess) {
    const cached = localStorage.getItem('tg_write_access');
    if (cached === 'granted' || cached === 'denied') return;
    try {
      tg.requestWriteAccess((ok: boolean) => {
        try { localStorage.setItem('tg_write_access', ok ? 'granted' : 'denied'); } catch {}
      });
    } catch {}
    return;
  }

  // Native (iOS/Android via Capacitor)
  if (Capacitor.isNativePlatform()) {
    try {
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive === 'granted') {
        // The token will arrive via the 'registration' listener in useNotificationSettings
        try { await PushNotifications.register(); } catch {}
      }
    } catch (err) {
      console.error('[Permissions] Native push error:', err);
    }
    return;
  }

  // Web (FCM)
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;

    if (!messaging) return;
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (fcmToken) {
      await saveDeviceToken(fcmToken, 'web');
    }
  } catch (err) {
    console.error('[Permissions] Web push error:', err);
  }
}

// ---------- GEO ----------

function cacheLocation(latitude: number, longitude: number, accuracy: number) {
  try {
    localStorage.setItem('geolocation_cache', JSON.stringify({
      latitude, longitude, accuracy, timestamp: Date.now(),
    }));
  } catch {}
}

async function requestNativeGeoOnce(): Promise<'granted' | 'denied'> {
  const { Geolocation } = await import('@capacitor/geolocation');
  let status = await Geolocation.checkPermissions();
  if (status.location !== 'granted') {
    // Always re-request system dialog if not granted (even if previously denied)
    try {
      status = await Geolocation.requestPermissions();
    } catch {}
  }
  if (status.location === 'granted') {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
      cacheLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    } catch {}
    localStorage.setItem('geolocation_permission', 'granted');
    await setGeoEnabledInProfile(true);
    return 'granted';
  }
  localStorage.setItem('geolocation_permission', 'denied');
  await setGeoEnabledInProfile(false);
  return 'denied';
}

function requestWebGeoOnce(): Promise<'granted' | 'denied'> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        cacheLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        localStorage.setItem('geolocation_permission', 'granted');
        await setGeoEnabledInProfile(true);
        resolve('granted');
      },
      async () => {
        localStorage.setItem('geolocation_permission', 'denied');
        await setGeoEnabledInProfile(false);
        resolve('denied');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

async function handleGeoPermission() {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.LocationManager?.init) {
    try {
      await new Promise<void>((resolve) => {
        try { tg.LocationManager.init(() => resolve()); } catch { resolve(); }
        setTimeout(resolve, 3000);
      });
    } catch {}
  }

  const isNative = Capacitor.isNativePlatform();
  const requestOnce = isNative ? requestNativeGeoOnce : requestWebGeoOnce;

  try {
    const first = await requestOnce();
    if (first === 'granted') return;

    // Если отказали — сразу системно переспрашиваем ещё раз (один retry)
    await new Promise((r) => setTimeout(r, 400));
    await requestOnce();
  } catch (err) {
    console.error('[Permissions] Geo error:', err);
  }
}

// ---------- CAMERA (native only — pre-grants permission for QR scanner) ----------

async function handleCameraPermission() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Camera } = await import('@capacitor/camera');
    let status = await Camera.checkPermissions();
    if (status.camera === 'prompt' || status.camera === 'prompt-with-rationale') {
      status = await Camera.requestPermissions({ permissions: ['camera'] });
    }
    if (status.camera === 'granted') {
      try { localStorage.setItem('qr_camera_granted', 'true'); } catch {}
    }
  } catch (err) {
    console.error('[Permissions] Camera error:', err);
  }
}

// ---------- Status checks (skip if already in a final state) ----------

async function pushAlreadyResolved(): Promise<boolean> {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.requestWriteAccess) {
    const v = localStorage.getItem('tg_write_access');
    return v === 'granted' || v === 'denied';
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const s = await PushNotifications.checkPermissions();
      return s.receive === 'granted' || s.receive === 'denied';
    } catch { return true; }
  }
  if (typeof Notification === 'undefined') return true;
  return Notification.permission === 'granted' || Notification.permission === 'denied';
}

async function geoAlreadyResolved(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const s = await Geolocation.checkPermissions();
      return s.location === 'granted' || s.location === 'denied';
    } catch { return true; }
  }
  if (!('geolocation' in navigator)) return true;
  try {
    const anyNav = navigator as any;
    if (anyNav.permissions?.query) {
      const r = await anyNav.permissions.query({ name: 'geolocation' });
      return r.state === 'granted' || r.state === 'denied';
    }
  } catch {}
  const v = localStorage.getItem('geolocation_permission');
  return v === 'granted' || v === 'denied';
}

// ---------- Component ----------

export function PermissionsBootstrap() {
  // Mounts native push listeners (registration + foreground toast) app-wide
  const { initialize: initNativePush } = useNativePush();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Defer slightly so the home page renders first
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;

      // PUSH: only ask if not yet resolved AND we haven't asked in this app before
      const pushAsked = localStorage.getItem(PUSH_REQUESTED_KEY) === '1';
      const pushResolved = await pushAlreadyResolved();
      if (!pushResolved && !pushAsked) {
        try { localStorage.setItem(PUSH_REQUESTED_KEY, '1'); } catch {}
        if (Capacitor.isNativePlatform()) {
          await initNativePush();
        } else {
          await handlePushPermission();
        }
      } else if (pushResolved) {
        // Re-ensure native registration if granted (idempotent — gets us a fresh FCM token)
        if (Capacitor.isNativePlatform()) {
          try {
            const s = await PushNotifications.checkPermissions();
            if (s.receive === 'granted') await PushNotifications.register();
          } catch {}
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && messaging) {
          // Refresh web FCM token silently
          try {
            const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;
            const t = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
            if (t) await saveDeviceToken(t, 'web');
          } catch {}
        }
      }

      if (cancelled) return;

      // Small gap so two system dialogs don't stack
      await new Promise((r) => setTimeout(r, 600));
      if (cancelled) return;

      // GEO: всегда переспрашиваем системно, пока разрешение не выдано
      // (без плашек — браузер/ОС сами покажут диалог)
      const geoGranted = localStorage.getItem('geolocation_permission') === 'granted';
      if (!geoGranted) {
        try { localStorage.setItem(GEO_REQUESTED_KEY, '1'); } catch {}
        await handleGeoPermission();
      }

      if (cancelled) return;

      // CAMERA (native only): запрашиваем один раз, чтобы у бариста сразу был доступ к QR-сканеру
      if (Capacitor.isNativePlatform()) {
        const cameraAsked = localStorage.getItem(CAMERA_REQUESTED_KEY) === '1';
        if (!cameraAsked) {
          await new Promise((r) => setTimeout(r, 600));
          if (cancelled) return;
          try { localStorage.setItem(CAMERA_REQUESTED_KEY, '1'); } catch {}
          await handleCameraPermission();
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [initNativePush]);

  return null;
}
