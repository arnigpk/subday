import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { PermissionsPrePrompt } from './PermissionsPrePrompt';

const FLAG_KEY = 'permissions_bootstrap_v1';
const SNOOZE_KEY = 'permissions_bootstrap_snoozed_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

async function requestPushPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  // Telegram Mini App — ask bot write access
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.requestWriteAccess) {
    try {
      await new Promise<void>((resolve) => {
        try { tg.requestWriteAccess(() => resolve()); } catch { resolve(); }
        setTimeout(resolve, 5000);
      });
      return 'granted';
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

  // Web
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
  // Telegram LocationManager
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.LocationManager?.init) {
    try {
      await new Promise<void>((resolve) => {
        try { tg.LocationManager.init(() => resolve()); } catch { resolve(); }
        setTimeout(resolve, 3000);
      });
      // Fallthrough to native browser geo as backup for actual coords
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

  // Web / TMA fallback
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

function shouldSkip(): boolean {
  try {
    if (localStorage.getItem(FLAG_KEY) === 'done') return true;
    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (snoozed && Date.now() < parseInt(snoozed, 10)) return true;
  } catch {}
  return false;
}

export function PermissionsBootstrap() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (shouldSkip()) return;
    // Defer slightly so the home page has time to render
    const t = setTimeout(() => setShowPrompt(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleAllow = async () => {
    setShowPrompt(false);
    try { localStorage.setItem(FLAG_KEY, 'done'); } catch {}
    await requestPushPermission();
    await new Promise((r) => setTimeout(r, 800));
    await requestGeoPermission();
  };

  const handleLater = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
  };

  return <PermissionsPrePrompt open={showPrompt} onAllow={handleAllow} onLater={handleLater} />;
}
