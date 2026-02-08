import { useState, useEffect, useCallback, useRef } from 'react';

const LOCATION_CACHE_KEY = 'geolocation_cache';
const PERMISSION_KEY = 'geolocation_permission';
const CACHE_MAX_AGE = 15 * 60 * 1000; // 15 minutes

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

// Global singleton to prevent multiple geolocation requests
let globalGeolocationPromise: Promise<GeolocationPosition> | null = null;
let lastGlobalPosition: GeolocationPosition | null = null;

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

  const hasRequestedRef = useRef(false);
  const isMountedRef = useRef(true);

  const updatePosition = useCallback((position: GeolocationPosition) => {
    if (!isMountedRef.current) return;
    
    const { latitude, longitude, accuracy } = position.coords;
    
    setCachedLocation(latitude, longitude, accuracy);
    setStoredPermissionState('granted');
    lastGlobalPosition = position;
    
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

      // Use last global position if available and fresh
      if (lastGlobalPosition) {
        const age = Date.now() - lastGlobalPosition.timestamp;
        if (age < CACHE_MAX_AGE) {
          updatePosition(lastGlobalPosition);
          return;
        }
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

      // If we have valid cache and permission was previously granted,
      // use cache immediately and skip API call
      if (cached && storedPermission === 'granted') {
        setState({
          latitude: cached.latitude,
          longitude: cached.longitude,
          accuracy: cached.accuracy,
          loading: false,
          error: null,
          permissionDenied: false,
        });
        return;
      }

      // First time or no cache - need to request permission
      if (!hasRequestedRef.current) {
        hasRequestedRef.current = true;

        // Use global promise to prevent duplicate requests
        if (!globalGeolocationPromise) {
          globalGeolocationPromise = new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000, // 5 minutes
              ...options,
            });
          });
        }

        try {
          const position = await globalGeolocationPromise;
          updatePosition(position);
        } catch (error) {
          if (error instanceof GeolocationPositionError) {
            handleError(error);
          }
        } finally {
          // Clear promise after some time to allow refresh
          setTimeout(() => {
            globalGeolocationPromise = null;
          }, 60000);
        }
      }
    };

    initGeolocation();

    return () => {
      isMountedRef.current = false;
    };
  }, [updatePosition, handleError, options]);

  return state;
}
