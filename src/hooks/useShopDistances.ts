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

const CACHE_DURATION = 30000; // 30 seconds for responsive distance updates

export function useShopDistances(shops: ShopWithCoords[]): UseShopDistancesResult {
  const [distances, setDistances] = useState<Map<string, ShopDistance>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastCalcPosition = useRef<{ lat: number; lng: number } | null>(null);
  const lastCalcTime = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { latitude, longitude, error: geoError, permissionDenied, loading: geoLoading } = useGeolocation();

  // Stabilize shops array to prevent infinite re-renders
  const shopsKey = useMemo(() => {
    return shops.map(s => s.id).sort().join(',');
  }, [shops]);
  
  const stableShops = useMemo(() => shops, [shopsKey]);

  const calculateDistances = useCallback(async (userLat: number, userLng: number) => {
    // Filter shops with valid coordinates
    const shopsWithCoords = stableShops.filter(s => s.coordinates && s.coordinates.length > 0);
    
    if (shopsWithCoords.length === 0) {
      setDistances(new Map());
      return;
    }

    // Check cache - don't recalculate if not enough time passed
    const now = Date.now();
    if (lastCalcPosition.current && now - lastCalcTime.current < CACHE_DURATION) {
      const dLat = Math.abs(lastCalcPosition.current.lat - userLat);
      const dLng = Math.abs(lastCalcPosition.current.lng - userLng);
      // ~20m threshold in degrees for responsive updates
      if (dLat < 0.00018 && dLng < 0.00018) {
        return;
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      // Flatten all coordinates with shop reference for edge function
      const allCoords: { id: string; addressIndex: number; lat: number; lng: number }[] = [];
      shopsWithCoords.forEach(shop => {
        shop.coordinates.forEach((coord, index) => {
          if (coord?.lat && coord?.lng) {
            allCoords.push({
              id: shop.id,
              addressIndex: index,
              lat: coord.lat,
              lng: coord.lng,
            });
          }
        });
      });

      const { data, error: fnError } = await supabase.functions.invoke('calculate-distances', {
        body: {
          user_lat: userLat,
          user_lng: userLng,
          shops: allCoords.map(c => ({
            id: `${c.id}_${c.addressIndex}`, // unique id per address
            lat: c.lat,
            lng: c.lng,
          })),
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      // Process results - find closest address for each shop
      const shopDistances = new Map<string, { distance: number; duration: number; addressIndex: number }>();
      
      if (data?.distances) {
        data.distances.forEach((d: { shop_id: string; distance: number | null; duration: number | null }) => {
          // Parse composite id back to shop_id and addressIndex
          const parts = d.shop_id.split('_');
          const addressIndex = parseInt(parts.pop() || '0', 10);
          const shopId = parts.join('_');
          
          if (d.distance != null) {
            const existing = shopDistances.get(shopId);
            if (!existing || d.distance < existing.distance) {
              shopDistances.set(shopId, {
                distance: d.distance,
                duration: d.duration ?? 0,
                addressIndex,
              });
            }
          }
        });
      }

      // Convert to final format
      const newDistances = new Map<string, ShopDistance>();
      shopDistances.forEach((value, shopId) => {
        newDistances.set(shopId, {
          distance: value.distance,
          duration: value.duration,
          closestAddressIndex: value.addressIndex,
        });
      });

      setDistances(newDistances);
      lastCalcPosition.current = { lat: userLat, lng: userLng };
      lastCalcTime.current = now;
      
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error calculating distances:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [stableShops]);

  useEffect(() => {
    if (latitude != null && longitude != null && !geoLoading) {
      calculateDistances(latitude, longitude);
    }
  }, [latitude, longitude, geoLoading, calculateDistances]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
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

