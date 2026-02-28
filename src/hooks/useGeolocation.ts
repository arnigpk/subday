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
  } catch {
    // Ignore storage errors
  }
}

// Check browser permission API (more reliable than localStorage)
async function checkBrowserPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    // Safari doesn't support permissions API for geolocation
    if (!navigator.permissions || !navigator.permissions.query) {
      return getStoredPermissionState() || 'prompt';
    }
    
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state as 'granted' | 'denied' | 'prompt';
  } catch {
    // Fallback to stored state
    return getStoredPermissionState() || 'prompt';
  }
}

export function useGeolocation(options?: PositionOptions) {
  const [state, setState] = useState<GeolocationState>(() => {
    const cached = getCachedLocation();
    const savedPermission = getStoredPermissionState();
    
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

  const watchIdRef = useRef<number | null>(null);
  const hasRequestedRef = useRef(false);
  const isMountedRef = useRef(true);

  const updatePosition = useCallback((position: GeolocationPosition) => {
    if (!isMountedRef.current) return;
    
    const { latitude, longitude, accuracy } = position.coords;
    
    setCachedLocation(latitude, longitude, accuracy);
    setStoredPermissionState('granted');
    
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
    if (!isMountedRef.current) return;
    
    console.error('Geolocation error:', error.message);
    
    const isDenied = error.code === error.PERMISSION_DENIED;
    if (isDenied) {
      setStoredPermissionState('denied');
    }
    
    setState(prev => ({
      ...prev,
      loading: false,
      error: error.message,
      permissionDenied: isDenied,
    }));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    const initGeolocation = async () => {
      // Skip if already denied
      const storedPermission = getStoredPermissionState();
      if (storedPermission === 'denied') {
        return;
      }

      // Check if we have valid cached location
      const cached = getCachedLocation();
      
      if (!navigator.geolocation) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'Геолокация не поддерживается вашим браузером',
        }));
        return;
      }

      // Check browser permission state
      const browserPermission = await checkBrowserPermission();
      
      // If permission was denied at browser level
      if (browserPermission === 'denied') {
        setStoredPermissionState('denied');
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'Доступ к геолокации запрещён',
          permissionDenied: true,
        }));
        return;
      }

      const positionOptions: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 600000, // Accept cached position up to 10 minutes old
        ...options,
      };

      // If we have valid cache and permission was previously granted, 
      // only do background update (no prompt)
      if (cached && storedPermission === 'granted') {
        // Use maximumAge to get cached position from browser without prompting
        if (!hasRequestedRef.current) {
          hasRequestedRef.current = true;
          
          // Try to get position silently with long maximumAge
          navigator.geolocation.getCurrentPosition(
            updatePosition,
            () => {
              // Silently fail - we already have cached data
              console.log('Background geolocation update failed, using cache');
            },
            {
              ...positionOptions,
              maximumAge: 600000, // 10 minutes - likely to use browser cache
              timeout: 5000,
            }
          );
        }
        return;
      }

      // First time or no cache - need to request permission
      if (!hasRequestedRef.current) {
        hasRequestedRef.current = true;
        
        navigator.geolocation.getCurrentPosition(
          updatePosition,
          handleError,
          positionOptions
        );
      }
    };

    initGeolocation();

    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [updatePosition, handleError, options]);

  // No continuous watching - use cached position to avoid battery drain and slowness

  return state;
}
