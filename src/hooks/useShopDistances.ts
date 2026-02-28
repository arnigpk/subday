import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from './useGeolocation';

export interface ShopDistance {
  distance: number | null; // meters
  duration: number | null; // seconds
  closestAddressIndex: number; // index of closest address in coordinates array
}

export interface UseShopDistancesResult {
  distances: Map<string, ShopDistance>;
  loading: boolean;
  error: string | null;
  userLocation: { lat: number; lng: number } | null;
  locationError: string | null;
  permissionDenied: boolean;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

interface ShopWithCoords {
  id: string;
  coordinates: Coordinate[];
}

// Haversine formula for instant client-side distance calculation
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcHaversineDistances(
  userLat: number, userLng: number, shops: ShopWithCoords[]
): Map<string, ShopDistance> {
  const result = new Map<string, ShopDistance>();
  for (const shop of shops) {
    if (!shop.coordinates?.length) continue;
    let minDist = Infinity;
    let bestIdx = 0;
    shop.coordinates.forEach((coord, idx) => {
      if (!coord?.lat || !coord?.lng) return;
      const d = haversineDistance(userLat, userLng, coord.lat, coord.lng);
      if (d < minDist) { minDist = d; bestIdx = idx; }
    });
    if (minDist < Infinity) {
      result.set(shop.id, {
        distance: Math.round(minDist),
        duration: Math.round(minDist / 1.4), // ~walking speed estimate
        closestAddressIndex: bestIdx,
      });
    }
  }
  return result;
}

const API_CACHE_DURATION = 120000; // Only call API every 2min for accurate durations

export function useShopDistances(shops: ShopWithCoords[]): UseShopDistancesResult {
  const [distances, setDistances] = useState<Map<string, ShopDistance>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastApiPosition = useRef<{ lat: number; lng: number } | null>(null);
  const lastApiTime = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { latitude, longitude, error: geoError, permissionDenied, loading: geoLoading } = useGeolocation();

  const shopsKey = useMemo(() => shops.map(s => s.id).sort().join(','), [shops]);
  const stableShops = useMemo(() => shops, [shopsKey]);

  // INSTANT: Calculate Haversine distances every time position updates (every 2-4s)
  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const haversine = calcHaversineDistances(latitude, longitude, stableShops);
    if (haversine.size > 0) {
      setDistances(haversine);
    }
  }, [latitude, longitude, stableShops]);

  // BACKGROUND: Call API for accurate durations, less frequently
  const fetchApiDistances = useCallback(async (userLat: number, userLng: number) => {
    const shopsWithCoords = stableShops.filter(s => s.coordinates?.length > 0);
    if (shopsWithCoords.length === 0) return;

    const now = Date.now();
    if (lastApiPosition.current && now - lastApiTime.current < API_CACHE_DURATION) {
      const dLat = Math.abs(lastApiPosition.current.lat - userLat);
      const dLng = Math.abs(lastApiPosition.current.lng - userLng);
      if (dLat < 0.0005 && dLng < 0.0005) return; // ~50m threshold
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const allCoords: { id: string; addressIndex: number; lat: number; lng: number }[] = [];
      shopsWithCoords.forEach(shop => {
        shop.coordinates.forEach((coord, index) => {
          if (coord?.lat && coord?.lng) {
            allCoords.push({ id: shop.id, addressIndex: index, lat: coord.lat, lng: coord.lng });
          }
        });
      });

      const { data, error: fnError } = await supabase.functions.invoke('calculate-distances', {
        body: {
          user_lat: userLat,
          user_lng: userLng,
          shops: allCoords.map(c => ({ id: `${c.id}_${c.addressIndex}`, lat: c.lat, lng: c.lng })),
        },
      });

      if (fnError) throw new Error(fnError.message);

      if (data?.distances) {
        const shopDistances = new Map<string, { distance: number; duration: number; addressIndex: number }>();
        data.distances.forEach((d: { shop_id: string; distance: number | null; duration: number | null }) => {
          const parts = d.shop_id.split('_');
          const addressIndex = parseInt(parts.pop() || '0', 10);
          const shopId = parts.join('_');
          if (d.distance != null) {
            const existing = shopDistances.get(shopId);
            if (!existing || d.distance < existing.distance) {
              shopDistances.set(shopId, { distance: d.distance, duration: d.duration ?? 0, addressIndex });
            }
          }
        });

        const newDistances = new Map<string, ShopDistance>();
        shopDistances.forEach((value, shopId) => {
          newDistances.set(shopId, { distance: value.distance, duration: value.duration, closestAddressIndex: value.addressIndex });
        });
        if (newDistances.size > 0) setDistances(newDistances);
      }

      lastApiPosition.current = { lat: userLat, lng: userLng };
      lastApiTime.current = now;
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error calculating distances:', err);
        setError(err.message);
      }
    }
  }, [stableShops]);

  // Trigger API call on first geo fix and significant movement
  useEffect(() => {
    if (latitude != null && longitude != null && !geoLoading) {
      fetchApiDistances(latitude, longitude);
    }
  }, [latitude, longitude, geoLoading, fetchApiDistances]);

  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  return {
    distances,
    loading: loading || geoLoading,
    error,
    userLocation: latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
    locationError: geoError,
    permissionDenied,
  };
}
