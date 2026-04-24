import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { PermissionsPrePrompt } from './PermissionsPrePrompt';

const SNOOZE_KEY = 'permissions_bootstrap_snoozed_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type PermStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

// ---------- STATUS CHECKS (no prompt shown) ----------

async function checkPushStatus(): Promise<PermStatus> {
  const tg = (window as any).Telegram?.WebApp;
  // In Telegram we can't reliably read prior write-access state; treat as 'prompt'
  // unless we've previously cached a granted result.
  if (tg?.requestWriteAccess) {
    const cached = localStorage.getItem('tg_write_access');
    if (cached === 'granted') return 'granted';
    if (cached === 'denied') return 'denied';
    return 'prompt';
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const status = await PushNotifications.checkPermissions();
      if (status.receive === 'granted') return 'granted';
      if (status.receive === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof Notification !== 'undefined' && 'permission' in Notification) {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'prompt';
  }
  return 'unsupported';
}

async function checkGeoStatus(): Promise<PermStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  // Web / TMA
  if (!('geolocation' in navigator)) return 'unsupported';
  // Permissions API where available
  try {
    const anyNav = navigator as any;
    if (anyNav.permissions?.query) {
      const res = await anyNav.permissions.query({ name: 'geolocation' });
      if (res.state === 'granted') return 'granted';
      if (res.state === 'denied') return 'denied';
      return 'prompt';
    }
  } catch {}
  // Fallback to our cached flag
  const cached = localStorage.getItem('geolocation_permission');
  if (cached === 'granted') return 'granted';
  if (cached === 'denied') return 'denied';
  return 'prompt';
}

// ---------- ACTUAL REQUESTS (system dialogs) ----------

async function requestPushPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.requestWriteAccess) {
    try {
      const result = await new Promise<'granted' | 'denied'>((resolve) => {
        let done = false;
        try {
          tg.requestWriteAccess((ok: boolean) => {
            if (done) return;
            done = true;
            resolve(ok ? 'granted' : 'denied');
          });
        } catch { resolve('denied'); }
        setTimeout(() => { if (!done) { done = true; resolve('denied'); } }, 5000);
      });
      try { localStorage.setItem('tg_write_access', result); } catch {}
      return result;
    } catch { return 'denied'; }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const status = await PushNotifications.checkPermissions();
      if (status.receive === 'granted') {
        try { await PushNotifications.register(); } catch {}
        return 'granted';
      }
      const req = await PushNotifications.requestPermissions();
      if (req.receive === 'granted') {
        try { await PushNotifications.register(); } catch {}
        return 'granted';
      }
      return 'denied';
    } catch { return 'denied'; }
  }

  if (typeof Notification !== 'undefined' && 'requestPermission' in Notification) {
    try {
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      const result = await Notification.requestPermission();
      return result === 'granted' ? 'granted' : 'denied';
    } catch { return 'denied'; }
  }
  return 'unsupported';
}

async function requestGeoPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.LocationManager?.init) {
    try {
      await new Promise<void>((resolve) => {
        try { tg.LocationManager.init(() => resolve()); } catch { resolve(); }
        setTimeout(resolve, 3000);
      });
    } catch {}
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') {
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
          cacheLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        } catch {}
        localStorage.setItem('geolocation_permission', 'granted');
        return 'granted';
      }
      const req = await Geolocation.requestPermissions();
      if (req.location === 'granted') {
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
          cacheLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        } catch {}
        localStorage.setItem('geolocation_permission', 'granted');
        return 'granted';
      }
      localStorage.setItem('geolocation_permission', 'denied');
      return 'denied';
    } catch { return 'denied'; }
  }

  if (!('geolocation' in navigator)) return 'unsupported';
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cacheLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        localStorage.setItem('geolocation_permission', 'granted');
        resolve('granted');
      },
      () => {
        localStorage.setItem('geolocation_permission', 'denied');
        resolve('denied');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function cacheLocation(latitude: number, longitude: number, accuracy: number) {
  try {
    localStorage.setItem('geolocation_cache', JSON.stringify({
      latitude, longitude, accuracy, timestamp: Date.now(),
    }));
  } catch {}
}

function isSnoozed(): boolean {
  try {
    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (snoozed && Date.now() < parseInt(snoozed, 10)) return true;
  } catch {}
  return false;
}

export function PermissionsBootstrap() {
  const [showPrompt, setShowPrompt] = useState(false);
  // Track which permissions actually need to be requested (status === 'prompt')
  const [needPush, setNeedPush] = useState(false);
  const [needGeo, setNeedGeo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const evaluate = async () => {
      // Always check current status — even if previously snoozed, we still
      // skip showing the prompt if BOTH are already granted/denied (final states).
      const [pushStatus, geoStatus] = await Promise.all([
        checkPushStatus(),
        checkGeoStatus(),
      ]);

      if (cancelled) return;

      const pushNeedsAsk = pushStatus === 'prompt';
      const geoNeedsAsk = geoStatus === 'prompt';

      // If BOTH are already in a final state (granted/denied/unsupported) — never ask.
      if (!pushNeedsAsk && !geoNeedsAsk) {
        // Auto-register push token on native if granted (idempotent)
        if (pushStatus === 'granted' && Capacitor.isNativePlatform()) {
          try { await PushNotifications.register(); } catch {}
        }
        return;
      }

      // At least one needs asking — respect snooze before showing pre-prompt.
      if (isSnoozed()) return;

      setNeedPush(pushNeedsAsk);
      setNeedGeo(geoNeedsAsk);

      // Defer slightly so the home page has time to render
      setTimeout(() => {
        if (!cancelled) setShowPrompt(true);
      }, 1500);
    };

    evaluate();
    return () => { cancelled = true; };
  }, []);

  const handleAllow = async () => {
    setShowPrompt(false);
    // Clear snooze — user actively engaged
    try { localStorage.removeItem(SNOOZE_KEY); } catch {}

    if (needPush) {
      await requestPushPermission();
      // Small gap so two system dialogs don't stack
      if (needGeo) await new Promise((r) => setTimeout(r, 800));
    }
    if (needGeo) {
      await requestGeoPermission();
    }
  };

  const handleLater = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
  };

  return <PermissionsPrePrompt open={showPrompt} onAllow={handleAllow} onLater={handleLater} />;
}
