import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

const LOCATION_CACHE_KEY = 'geolocation_cache';
const PERMISSION_KEY = 'geolocation_permission';
const CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

interface CachedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

function getCachedLocation(): CachedLocation | null {
  try {
    const cached = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!cached) return null;
    const data: CachedLocation = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_MAX_AGE) {
      localStorage.removeItem(LOCATION_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedLocation(lat: number, lng: number, accuracy: number) {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({
      latitude: lat, longitude: lng, accuracy, timestamp: Date.now(),
    }));
  } catch {}
}

function getStoredPermissionState(): 'granted' | 'denied' | null {
  try {
    return localStorage.getItem(PERMISSION_KEY) as 'granted' | 'denied' | null;
  } catch {
    return null;
  }
}

function setStoredPermissionState(state: 'granted' | 'denied') {
  try { localStorage.setItem(PERMISSION_KEY, state); } catch {}
}

export function useGeolocation(options?: PositionOptions) {
  const [state, setState] = useState<GeolocationState>(() => {
    const cached = getCachedLocation();
    const savedPermission = getStoredPermissionState();
    
    if (savedPermission === 'denied') {
      return { latitude: null, longitude: null, accuracy: null, loading: false, error: 'Доступ к геолокации запрещён', permissionDenied: true };
    }
    if (cached) {
      return { latitude: cached.latitude, longitude: cached.longitude, accuracy: cached.accuracy, loading: false, error: null, permissionDenied: false };
    }
    return { latitude: null, longitude: null, accuracy: null, loading: true, error: null, permissionDenied: false };
  });

  const watchIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const updatePosition = useCallback((position: GeolocationPosition) => {
    if (!isMountedRef.current) return;
    const { latitude, longitude, accuracy } = position.coords;
    setCachedLocation(latitude, longitude, accuracy);
    setStoredPermissionState('granted');
    setState({ latitude, longitude, accuracy, loading: false, error: null, permissionDenied: false });
  }, []);

  const handleError = useCallback((error: any) => {
    if (!isMountedRef.current) return;
    const message = error?.message || 'Ошибка геолокации';
    // code 1 === PERMISSION_DENIED (web). Native plugin reports denial via message.
    const isDenied = error?.code === 1 || /denied|permission/i.test(message);
    if (isDenied) setStoredPermissionState('denied');
    setState(prev => ({ ...prev, loading: false, error: message, permissionDenied: isDenied }));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (getStoredPermissionState() === 'denied') {
      setState(prev => ({ ...prev, loading: false, permissionDenied: true }));
      return;
    }

    const positionOptions: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 3000, // Accept positions up to 3s old for fast updates
      ...options,
    };

    // Native (iOS + Android): use the Capacitor Geolocation plugin.
    // navigator.geolocation does NOT work in iOS WKWebView, and the plugin is
    // the reliable native path on Android too.
    if (Capacitor.isNativePlatform()) {
      let nativeWatchId: string | null = null;
      let cancelled = false;
      (async () => {
        try {
          const { Geolocation } = await import('@capacitor/geolocation');
          const id = await Geolocation.watchPosition(positionOptions, (position, err) => {
            if (err) { handleError(err); return; }
            if (position) updatePosition(position as unknown as GeolocationPosition);
          });
          if (cancelled) {
            Geolocation.clearWatch({ id });
          } else {
            nativeWatchId = id;
          }
        } catch (e) {
          handleError(e);
        }
      })();

      return () => {
        isMountedRef.current = false;
        cancelled = true;
        if (nativeWatchId) {
          import('@capacitor/geolocation').then(({ Geolocation }) =>
            Geolocation.clearWatch({ id: nativeWatchId! })
          ).catch(() => {});
        }
      };
    }

    // Web: browser geolocation
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, loading: false, error: 'Геолокация не поддерживается' }));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      updatePosition,
      handleError,
      positionOptions
    );

    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [updatePosition, handleError, options]);

  return state;
}
