import { useState, useEffect, useCallback, useRef } from 'react';

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
  try {
    localStorage.setItem(PERMISSION_KEY, state);
  } catch {}
}

export function useGeolocation() {
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

  const handleError = useCallback((error: GeolocationPositionError) => {
    if (!isMountedRef.current) return;
    const isDenied = error.code === error.PERMISSION_DENIED;
    if (isDenied) setStoredPermissionState('denied');
    setState(prev => ({ ...prev, loading: false, error: error.message, permissionDenied: isDenied }));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (getStoredPermissionState() === 'denied' || !navigator.geolocation) {
      if (!navigator.geolocation) {
        setState(prev => ({ ...prev, loading: false, error: 'Геолокация не поддерживается' }));
      }
      return;
    }

    // Get initial position fast
    navigator.geolocation.getCurrentPosition(updatePosition, handleError, {
      enableHighAccuracy: false,
      timeout: 3000,
      maximumAge: 600000,
    });

    // Start watching for live updates (every 2-4s movement tracking)
    watchIdRef.current = navigator.geolocation.watchPosition(
      updatePosition,
      (err) => {
        // Only log watch errors, don't override state if we already have position
        console.log('Watch position update:', err.message);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 3000, // Accept 3s old position for frequent updates
      }
    );

    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [updatePosition, handleError]);

  return state;
}
