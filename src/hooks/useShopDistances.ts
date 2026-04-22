import { useState, useEffect, useMemo } from 'react';
import { useGeolocation } from './useGeolocation';
import { isShopOpen } from '@/utils/shopHours';
import { haversineDistanceMeters } from '@/utils/haversine';

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
  working_hours?: string;
}

interface ShopWithCoords {
  id: string;
  coordinates: Coordinate[];
  shopWorkingHours?: string | null;
}

function calcHaversineDistances(
  userLat: number, userLng: number, shops: ShopWithCoords[]
): Map<string, ShopDistance> {
  const result = new Map<string, ShopDistance>();
  for (const shop of shops) {
    if (!shop.coordinates?.length) continue;

    const addressDistances: Array<{ idx: number; dist: number; isOpen: boolean }> = [];
    shop.coordinates.forEach((coord, idx) => {
      if (!coord?.lat || !coord?.lng) return;
      const d = haversineDistanceMeters(userLat, userLng, coord.lat, coord.lng);
      const hours = coord.working_hours?.trim() || shop.shopWorkingHours || null;
      const open = hours ? isShopOpen(hours) : false;
      addressDistances.push({ idx, dist: d, isOpen: open });
    });

    if (addressDistances.length === 0) continue;

    // Prefer nearest OPEN address; if none open, use nearest overall
    const openAddresses = addressDistances.filter(a => a.isOpen);
    const candidates = openAddresses.length > 0 ? openAddresses : addressDistances;
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];

    result.set(shop.id, {
      distance: Math.round(best.dist),
      duration: Math.round(best.dist / 8.33), // ~30 km/h city driving speed
      closestAddressIndex: best.idx,
    });
  }
  return result;
}

export function useShopDistances(shops: ShopWithCoords[]): UseShopDistancesResult {
  const [distances, setDistances] = useState<Map<string, ShopDistance>>(new Map());

  const { latitude, longitude, error: geoError, permissionDenied, loading: geoLoading } = useGeolocation();

  const shopsKey = useMemo(() => shops.map(s => s.id).sort().join(','), [shops]);
  const stableShops = useMemo(() => shops, [shopsKey]);

  // Calculate Haversine distances every time position updates
  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const haversine = calcHaversineDistances(latitude, longitude, stableShops);
    if (haversine.size > 0) {
      setDistances(haversine);
    }
  }, [latitude, longitude, stableShops]);

  return {
    distances,
    loading: geoLoading,
    error: null,
    userLocation: latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
    locationError: geoError,
    permissionDenied,
  };
}
