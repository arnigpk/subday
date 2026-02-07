import { useState, useEffect, useCallback } from 'react';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

export function useGeolocation(options?: PositionOptions) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    loading: true,
    error: null,
    permissionDenied: false,
  });

  const updatePosition = useCallback((position: GeolocationPosition) => {
    setState({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      loading: false,
      error: null,
      permissionDenied: false,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    console.error('Geolocation error:', error.message);
    setState(prev => ({
      ...prev,
      loading: false,
      error: error.message,
      permissionDenied: error.code === error.PERMISSION_DENIED,
    }));
  }, []);

  useEffect(() => {
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
      maximumAge: 30000, // Cache position for 30 seconds
      ...options,
    };

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      updatePosition,
      handleError,
      defaultOptions
    );

    // Watch for position changes
    const watchId = navigator.geolocation.watchPosition(
      updatePosition,
      handleError,
      {
        ...defaultOptions,
        maximumAge: 10000, // More frequent updates when watching
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [updatePosition, handleError, options]);

  return state;
}
