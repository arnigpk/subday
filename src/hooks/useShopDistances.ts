import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from './useGeolocation';

export interface ShopDistance {
  distance: number | null; // meters
  duration: number | null; // seconds
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

const CACHE_DURATION = 30000; // 30 seconds
const MIN_DISTANCE_CHANGE = 50; // meters - minimum user movement to trigger recalculation

export function useShopDistances(shops: ShopWithCoords[]): UseShopDistancesResult {
  const [distances, setDistances] = useState<Map<string, ShopDistance>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastCalcPosition = useRef<{ lat: number; lng: number } | null>(null);
  const lastCalcTime = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { latitude, longitude, error: geoError, permissionDenied, loading: geoLoading } = useGeolocation();

  const calculateDistances = useCallback(async (userLat: number, userLng: number) => {
    // Filter shops with valid coordinates (use first coordinate from array)
    const shopsWithCoords = shops.filter(s => s.coordinates && s.coordinates.length > 0 && s.coordinates[0]?.lat && s.coordinates[0]?.lng);
    
    if (shopsWithCoords.length === 0) {
      setDistances(new Map());
      return;
    }

    // Check cache - don't recalculate if user hasn't moved much
    const now = Date.now();
    if (lastCalcPosition.current && now - lastCalcTime.current < CACHE_DURATION) {
      const movedDistance = haversineDistance(
        lastCalcPosition.current.lat,
        lastCalcPosition.current.lng,
        userLat,
        userLng
      );
      if (movedDistance < MIN_DISTANCE_CHANGE) {
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
      const { data, error: fnError } = await supabase.functions.invoke('calculate-distances', {
        body: {
          user_lat: userLat,
          user_lng: userLng,
          shops: shopsWithCoords.map(s => ({
            id: s.id,
            lat: s.coordinates[0].lat,
            lng: s.coordinates[0].lng,
          })),
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      const newDistances = new Map<string, ShopDistance>();
      
      if (data?.distances) {
        data.distances.forEach((d: { shop_id: string; distance: number | null; duration: number | null }) => {
          newDistances.set(d.shop_id, {
            distance: d.distance,
            duration: d.duration,
          });
        });
      }

      setDistances(newDistances);
      lastCalcPosition.current = { lat: userLat, lng: userLng };
      lastCalcTime.current = now;
      
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error calculating distances:', err);
        setError(err.message);
        
        // Fallback to client-side Haversine
        const fallbackDistances = new Map<string, ShopDistance>();
        shopsWithCoords.forEach(shop => {
          const coord = shop.coordinates[0];
          if (coord?.lat && coord?.lng) {
            const dist = haversineDistance(userLat, userLng, coord.lat, coord.lng);
            fallbackDistances.set(shop.id, {
              distance: Math.round(dist),
              duration: Math.round((dist / 1000) / 50 * 3600), // ~50 km/h
            });
          }
        });
        setDistances(fallbackDistances);
      }
    } finally {
      setLoading(false);
    }
  }, [shops]);

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

// Haversine formula for fallback
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
