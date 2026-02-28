import { useState, useEffect, useMemo } from 'react';
import { useGeolocation } from './useGeolocation';

export interface ShopDistance {
  distance: number | null; // meters (straight-line)
  duration: number | null; // estimated walking seconds
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

// Haversine formula for straight-line distance
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
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
        duration: Math.round(minDist / 1.4),
        closestAddressIndex: bestIdx,
      });
    }
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
