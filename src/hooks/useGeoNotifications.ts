import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from './useGeolocation';
import { haversineDistanceMeters } from '@/utils/haversine';
import { fetchGeoClientConfig, GeoClientConfig } from '@/lib/geoConfig';

const CHECK_INTERVAL_MS = 60_000; // проверяем не чаще 1 раза в минуту
const LS_KEY = 'subday_geo_notify_last_call';
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
  } catch { return 0; }
}

function setLastCall(ts: number) {
  try { localStorage.setItem(LS_KEY, String(ts)); } catch {}
}

/**
 * Гео-уведомления о ближайших кофейнях.
 * Активирует серверную проверку, когда пользователь приближается к partner-кофейне.
 * Все условия (подписка, кулдаун, рабочие часы, дневной лимит) проверяются на сервере.
 */
export function useGeoNotifications(enabled: boolean) {
  const { latitude, longitude } = useGeolocation();
  const shopsRef = useRef<ShopRow[]>([]);
  const lastCheckRef = useRef(0);
  const configRef = useRef<GeoClientConfig>({
    radiusMeters: DEFAULT_RADIUS_M,
    localCooldownMs: DEFAULT_LOCAL_COOLDOWN_MS,
  });

  // Загружаем активные кофейни + конфиг гео (радиус, локальный кулдаун) один раз
  useEffect(() => {
    if (!enabled) return;
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
    return () => { cancelled = true; };
  }, [enabled]);

  // На каждое обновление координат — проверяем близость
  useEffect(() => {
    if (!enabled) return;
    if (latitude == null || longitude == null) return;

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
        const lat = Number(c?.lat ?? c?.latitude);
        const lng = Number(c?.lng ?? c?.longitude ?? c?.lon);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const d = haversineDistanceMeters(latitude, longitude, lat, lng);
        if (d < minDist) minDist = d;
      }
      if (minDist <= radius) {
        candidates.push({ shop_id: shop.id, distance_m: minDist });
      }
    }

    if (candidates.length === 0) return;

    // Берём максимум 3 ближайших, чтобы сервер выбрал лучшую
    candidates.sort((a, b) => a.distance_m - b.distance_m);
    const top = candidates.slice(0, 3);

    setLastCall(now);

    supabase.functions
      .invoke('geo-notify', {
        body: { lat: latitude, lng: longitude, candidates: top },
      })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[geo-notify] error', error);
        } else {
          console.log('[geo-notify]', data);
        }
      })
      .catch((e) => console.warn('[geo-notify] invoke failed', e));
  }, [enabled, latitude, longitude]);
}
