/**
 * Checks if a shop is currently open based on its working hours
 * @param openHours - Working hours string in format "HH:MM–HH:MM" (e.g., "08:00–22:00")
 * @returns boolean - true if shop is currently open
 */
export function isShopOpen(openHours: string): boolean {
  try {
    const match = openHours.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if (!match) {
      console.warn('Invalid openHours format:', openHours);
      return false;
    }

    const [, openHour, openMinute, closeHour, closeMinute] = match;
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const openTime = parseInt(openHour) * 60 + parseInt(openMinute);
    const closeTime = parseInt(closeHour) * 60 + parseInt(closeMinute);
    
    if (closeTime < openTime) {
      return currentMinutes >= openTime || currentMinutes < closeTime;
    }
    
    return currentMinutes >= openTime && currentMinutes < closeTime;
  } catch (error) {
    console.error('Error parsing shop hours:', error);
    return false;
  }
}

/**
 * Checks if ANY address of a shop is currently open.
 * Checks per-address working_hours from coordinates array first,
 * falls back to shop-level working_hours.
 */
export function isAnyAddressOpen(
  shopWorkingHours: string | null | undefined,
  coordinates?: Array<{ working_hours?: string }> | null
): boolean {
  if (coordinates && coordinates.length > 0) {
    for (const coord of coordinates) {
      const hours = coord?.working_hours?.trim() || shopWorkingHours;
      if (hours && isShopOpen(hours)) return true;
    }
    return false;
  }
  return shopWorkingHours ? isShopOpen(shopWorkingHours) : false;
}

/**
 * Gets the shop status text
 * @param openHours - Working hours string
 * @returns object with isOpen boolean and status text
 */
export function getShopStatus(openHours: string): { isOpen: boolean; statusText: string; opensAt?: string; closesAt?: string } {
  const isOpen = isShopOpen(openHours);
  
  const match = openHours.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  const opensAt = match?.[1];
  const closesAt = match?.[2];
  
  if (isOpen) {
    return {
      isOpen: true,
      statusText: 'Открыто',
      opensAt,
      closesAt,
    };
  } else {
    return {
      isOpen: false,
      statusText: 'Закрыто',
      opensAt,
      closesAt,
    };
  }
}

/**
 * Hook to get real-time shop open status that updates every minute
 */
import { useState, useEffect } from 'react';

export function useShopStatus(openHours: string) {
  const [status, setStatus] = useState(() => getShopStatus(openHours));
  
  useEffect(() => {
    // Update immediately
    setStatus(getShopStatus(openHours));
    
    // Update every minute
    const interval = setInterval(() => {
      setStatus(getShopStatus(openHours));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [openHours]);
  
  return status;
}
