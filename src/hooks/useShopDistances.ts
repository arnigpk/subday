import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation, getCachedLocation } from './useGeolocation';

export interface ShopDistance {
  distance: number | null;
  duration: number | null;
  closestAddressIndex: number;
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

// Haversine for instant local calculation (no API call needed)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const API_CACHE_DURATION = 120000; // 2 min - for Mapbox API calls only

export function useShopDistances(shops: ShopWithCoords[]): UseShopDistancesResult {
  const [distances, setDistances] = useState<Map<string, ShopDistance>>(() => {
    // Initialize with cached location for instant distances
    const cached = getCachedLocation();
    if (!cached || shops.length === 0) return new Map();
    const initial = new Map<string, ShopDistance>();
    shops.forEach(shop => {
      if (!shop.coordinates?.length) return;
      let minDist = Infinity;
      let closestIdx = 0;
      shop.coordinates.forEach((coord, idx) => {
        if (coord?.lat && coord?.lng) {
          const dist = haversineDistance(cached.latitude, cached.longitude, coord.lat, coord.lng);
          if (dist < minDist) { minDist = dist; closestIdx = idx; }
        }
      });
      if (minDist < Infinity) {
        initial.set(shop.id, { distance: Math.round(minDist), duration: null, closestAddressIndex: closestIdx });
      }
    });
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastApiPosition = useRef<{ lat: number; lng: number } | null>(null);
  const lastApiTime = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { latitude, longitude, error: geoError, permissionDenied, loading: geoLoading } = useGeolocation();

  const shopsKey = useMemo(() => shops.map(s => s.id).sort().join(','), [shops]);
  const stableShops = useMemo(() => shops, [shopsKey]);

  // Instant local distance calculation using Haversine (runs on every position update)
  const calculateLocalDistances = useCallback((userLat: number, userLng: number) => {
    const shopsWithCoords = stableShops.filter(s => s.coordinates?.length > 0);
    if (shopsWithCoords.length === 0) return;

    const newDistances = new Map<string, ShopDistance>();
    shopsWithCoords.forEach(shop => {
      let minDist = Infinity;
      let closestIdx = 0;
      shop.coordinates.forEach((coord, idx) => {
        if (coord?.lat && coord?.lng) {
          const dist = haversineDistance(userLat, userLng, coord.lat, coord.lng);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        }
      });
      if (minDist < Infinity) {
        // Keep existing duration from API if available
        const existing = distances.get(shop.id);
        newDistances.set(shop.id, {
          distance: Math.round(minDist),
          duration: existing?.duration ?? null,
          closestAddressIndex: closestIdx,
        });
      }
    });
    setDistances(newDistances);
  }, [stableShops, distances]);

  // Mapbox API call for accurate driving distances (throttled)
  const fetchApiDistances = useCallback(async (userLat: number, userLng: number) => {
    const shopsWithCoords = stableShops.filter(s => s.coordinates?.length > 0);
    if (shopsWithCoords.length === 0) return;

    const now = Date.now();
    if (lastApiPosition.current && now - lastApiTime.current < API_CACHE_DURATION) {
      const dLat = Math.abs(lastApiPosition.current.lat - userLat);
      const dLng = Math.abs(lastApiPosition.current.lng - userLng);
      if (dLat < 0.00045 && dLng < 0.00045) return; // ~50m threshold
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

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

      const shopDistances = new Map<string, { distance: number; duration: number; addressIndex: number }>();
      if (data?.distances) {
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
      }

      // Only update duration from API, keep Haversine distance for consistency (no flickering)
      setDistances(prev => {
        const updated = new Map(prev);
        shopDistances.forEach((value, shopId) => {
          const existing = updated.get(shopId);
          updated.set(shopId, {
            distance: existing?.distance ?? Math.round(value.distance),
            duration: value.duration,
            closestAddressIndex: existing?.closestAddressIndex ?? value.addressIndex,
          });
        });
        return updated;
      });
      lastApiPosition.current = { lat: userLat, lng: userLng };
      lastApiTime.current = now;
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error calculating distances:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [stableShops]);

  // On every geolocation update → instant local recalc
  useEffect(() => {
    if (latitude != null && longitude != null && !geoLoading) {
      calculateLocalDistances(latitude, longitude);
    }
  }, [latitude, longitude, geoLoading]); // intentionally exclude calculateLocalDistances to avoid loops

  // Fetch accurate API distances (throttled, runs once then on significant movement)
  useEffect(() => {
    if (latitude != null && longitude != null && !geoLoading) {
      fetchApiDistances(latitude, longitude);
    }
  }, [latitude, longitude, geoLoading, fetchApiDistances]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
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
