import { useEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { haversineDistanceMeters } from '@/utils/haversine';
import { fetchGeoClientConfig, GeoClientConfig } from '@/lib/geoConfig';

/**
 * Фоновые гео-уведомления «Рядом кофейня» для НАТИВА (APK/iOS).
 *
 * Использует @capacitor-community/background-geolocation: на Android поднимается
 * foreground-service (постоянное уведомление) и держит процесс живым, на iOS
 * приложение будится по значимым перемещениям — поэтому проверка близости идёт
 * даже когда приложение свёрнуто или закрыто. При приближении к кофейне дёргается
 * edge-функция geo-notify, которая шлёт FCM-пуш (доходит независимо от состояния UI).
 *
 * Все бизнес-условия (подписка, кулдаун, часы работы, дневной лимит) дополнительно
 * проверяются на сервере в geo-notify. Здесь — только клиентский троттлинг и близость.
 */

interface BgLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}
interface BgError {
  code: string;
  message: string;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (location?: BgLocation, error?: BgError) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const CHECK_INTERVAL_MS = 60_000; // не чаще 1 раза в минуту считаем близость
const LS_KEY = 'subday_geo_notify_last_call'; // общий ключ с foreground-версией
// Радиус и локальный кулдаун редактируются в админке (fallback ниже).
const DEFAULT_RADIUS_M = 250;
const DEFAULT_LOCAL_COOLDOWN_MS = 30 * 60 * 1000;

interface ShopRow {
  id: string;
  is_active: boolean | null;
  coordinates: any;
}

function getLastCall(): number {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}
function setLastCall(ts: number) {
  try {
    localStorage.setItem(LS_KEY, String(ts));
  } catch {}
}

export function useBackgroundGeoNotifications(enabled: boolean) {
  const shopsRef = useRef<ShopRow[]>([]);
  const watcherIdRef = useRef<string | null>(null);
  const lastCheckRef = useRef(0);
  const configRef = useRef<GeoClientConfig>({
    radiusMeters: DEFAULT_RADIUS_M,
    localCooldownMs: DEFAULT_LOCAL_COOLDOWN_MS,
  });

  // Загружаем активные кофейни + конфиг гео (радиус, локальный кулдаун)
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;
    let cancelled = false;
    (async () => {
      const [{ data }, cfg] = await Promise.all([
        supabase.from('shops').select('id, is_active, coordinates').eq('is_active', true),
        fetchGeoClientConfig(),
      ]);
      if (cancelled) return;
      if (data) shopsRef.current = data as ShopRow[];
      configRef.current = cfg;
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Запускаем/останавливаем фоновый вотчер
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;

    let removed = false;

    (async () => {
      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: 'subday',
            backgroundMessage: 'Ищем кофейни рядом с вами',
            requestPermissions: true,
            stale: false,
            distanceFilter: 60,
          },
          (location, error) => {
            if (error || !location) return;
            handleLocation(location.latitude, location.longitude, shopsRef, lastCheckRef, configRef);
          },
        );
        if (removed) {
          BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
        } else {
          watcherIdRef.current = id;
        }
      } catch (e) {
        console.warn('[bg-geo] addWatcher failed', e);
      }
    })();

    return () => {
      removed = true;
      if (watcherIdRef.current) {
        BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current }).catch(() => {});
        watcherIdRef.current = null;
      }
    };
  }, [enabled]);
}

function handleLocation(
  lat: number,
  lng: number,
  shopsRef: React.MutableRefObject<ShopRow[]>,
  lastCheckRef: React.MutableRefObject<number>,
  configRef: React.MutableRefObject<GeoClientConfig>,
) {
  const now = Date.now();
  if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
  lastCheckRef.current = now;

  if (now - getLastCall() < configRef.current.localCooldownMs) return;

  const shops = shopsRef.current;
  if (shops.length === 0) return;
  const radius = configRef.current.radiusMeters;

  const candidates: Array<{ shop_id: string; distance_m: number }> = [];
  for (const shop of shops) {
    const coords = Array.isArray(shop.coordinates) ? shop.coordinates : [];
    let minDist = Infinity;
    for (const c of coords) {
      const slat = Number(c?.lat ?? c?.latitude);
      const slng = Number(c?.lng ?? c?.longitude ?? c?.lon);
      if (!isFinite(slat) || !isFinite(slng)) continue;
      const d = haversineDistanceMeters(lat, lng, slat, slng);
      if (d < minDist) minDist = d;
    }
    if (minDist <= radius) candidates.push({ shop_id: shop.id, distance_m: minDist });
  }

  if (candidates.length === 0) return;

  candidates.sort((a, b) => a.distance_m - b.distance_m);
  setLastCall(now);

  supabase.functions
    .invoke('geo-notify', { body: { lat, lng, candidates: candidates.slice(0, 3) } })
    .catch((e) => console.warn('[bg-geo] geo-notify invoke failed', e));
}
