import { useState, useEffect, useCallback, useRef } from 'react';

const LOCATION_CACHE_KEY = 'geolocation_cache';
const PERMISSION_KEY = 'geolocation_permission';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

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
    const age = Date.now() - data.timestamp;
    
    if (age > CACHE_MAX_AGE) {
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
    const data: CachedLocation = {
      latitude: lat,
      longitude: lng,
      accuracy,
      timestamp: Date.now(),
    };
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

function getPermissionState(): 'granted' | 'denied' | 'prompt' | null {
  try {
    return localStorage.getItem(PERMISSION_KEY) as 'granted' | 'denied' | null;
  } catch {
    return null;
  }
}

function setPermissionState(state: 'granted' | 'denied') {
  try {
    localStorage.setItem(PERMISSION_KEY, state);
  } catch {
    // Ignore storage errors
  }
}

export function useGeolocation(options?: PositionOptions) {
  const [state, setState] = useState<GeolocationState>(() => {
    // Initialize with cached location if available
    const cached = getCachedLocation();
    const savedPermission = getPermissionState();
    
    if (savedPermission === 'denied') {
      return {
        latitude: null,
        longitude: null,
        accuracy: null,
        loading: false,
        error: 'Доступ к геолокации запрещён',
        permissionDenied: true,
      };
    }
    
    if (cached) {
      return {
        latitude: cached.latitude,
        longitude: cached.longitude,
        accuracy: cached.accuracy,
        loading: false,
        error: null,
        permissionDenied: false,
      };
    }
    
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      loading: true,
      error: null,
      permissionDenied: false,
    };
  });

  const hasRequestedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  const updatePosition = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    
    setCachedLocation(latitude, longitude, accuracy);
    setPermissionState('granted');
    
    setState({
      latitude,
      longitude,
      accuracy,
      loading: false,
      error: null,
      permissionDenied: false,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    console.error('Geolocation error:', error.message);
    
    const isDenied = error.code === error.PERMISSION_DENIED;
    if (isDenied) {
      setPermissionState('denied');
    }
    
    setState(prev => ({
      ...prev,
      loading: false,
      error: error.message,
      permissionDenied: isDenied,
    }));
  }, []);

  useEffect(() => {
    // Don't request if already denied
    const savedPermission = getPermissionState();
    if (savedPermission === 'denied') {
      return;
    }

    // Don't request if we already have a recent cached location and haven't requested yet
    const cached = getCachedLocation();
    if (cached && !hasRequestedRef.current) {
      // Still set up watching for background updates, but don't block on it
      hasRequestedRef.current = true;
    }

    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Геолокация не поддерживается вашим браузером',
      }));
      return;
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000, // Cache for 1 minute
      ...options,
    };

    // Only request position if we don't have a valid cache
    if (!cached) {
      navigator.geolocation.getCurrentPosition(
        updatePosition,
        handleError,
        defaultOptions
      );
    }

    // Watch for position changes (less frequently)
    watchIdRef.current = navigator.geolocation.watchPosition(
      updatePosition,
      handleError,
      {
        ...defaultOptions,
        maximumAge: 30000, // 30 seconds for watching
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [updatePosition, handleError, options]);

  return state;
}
