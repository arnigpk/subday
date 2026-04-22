import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from './useGeolocation';

const RADIUS_M = 250; // должен соответствовать конфигу шаблона
const CHECK_INTERVAL_MS = 60_000; // проверяем не чаще 1 раза в минуту
const LOCAL_COOLDOWN_MS = 30 * 60 * 1000; // мин 30 мин между вызовами edge function локально
const LS_KEY = 'subday_geo_notify_last_call';

interface ShopRow {
  id: string;
  is_active: boolean | null;
  coordinates: any;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

  // Загружаем активные кофейни с координатами один раз
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('shops')
        .select('id, is_active, coordinates')
        .eq('is_active', true);
      if (!cancelled && data) {
        shopsRef.current = data as ShopRow[];
      }
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

    if (now - getLastCall() < LOCAL_COOLDOWN_MS) return;

    const shops = shopsRef.current;
    if (shops.length === 0) return;

    const candidates: Array<{ shop_id: string; distance_m: number }> = [];

    for (const shop of shops) {
      const coords = Array.isArray(shop.coordinates) ? shop.coordinates : [];
      let minDist = Infinity;
      for (const c of coords) {
        const lat = Number(c?.lat ?? c?.latitude);
        const lng = Number(c?.lng ?? c?.longitude ?? c?.lon);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const d = haversineMeters(latitude, longitude, lat, lng);
        if (d < minDist) minDist = d;
      }
      if (minDist <= RADIUS_M) {
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
