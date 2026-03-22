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

export interface WorkingHoursCoordinate {
  working_hours?: string | null;
}

export interface ShopStatusResult {
  isOpen: boolean;
  statusText: string;
  opensAt?: string;
  closesAt?: string;
  hours?: string | null;
  sourceIndex?: number;
}

function normalizeHours(hours?: string | null): string | null {
  const value = hours?.trim();
  return value ? value : null;
}

/**
 * Gets the shop status text
 * @param openHours - Working hours string
 * @returns object with isOpen boolean and status text
 */
export function getShopStatus(openHours: string): ShopStatusResult {
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
      hours: openHours,
    };
  }

  return {
    isOpen: false,
    statusText: 'Закрыто',
    opensAt,
    closesAt,
    hours: openHours,
  };
}

function getStatusCandidates(
  shopWorkingHours: string | null | undefined,
  coordinates?: WorkingHoursCoordinate[] | null,
): Array<{ index: number; hours: string; status: ShopStatusResult }> {
  if (coordinates && coordinates.length > 0) {
    const candidates = coordinates
      .map((coord, index) => {
        const hours = normalizeHours(coord?.working_hours) ?? normalizeHours(shopWorkingHours);
        if (!hours) return null;

        return {
          index,
          hours,
          status: getShopStatus(hours),
        };
      })
      .filter((candidate): candidate is { index: number; hours: string; status: ShopStatusResult } => Boolean(candidate));

    if (candidates.length > 0) {
      return candidates;
    }
  }

  const fallbackHours = normalizeHours(shopWorkingHours);
  if (!fallbackHours) return [];

  return [{
    index: 0,
    hours: fallbackHours,
    status: getShopStatus(fallbackHours),
  }];
}

/**
 * Checks if ANY address of a shop is currently open.
 * Checks per-address working_hours from coordinates array first,
 * falls back to shop-level working_hours.
 */
export function isAnyAddressOpen(
  shopWorkingHours: string | null | undefined,
  coordinates?: WorkingHoursCoordinate[] | null,
): boolean {
  return getStatusCandidates(shopWorkingHours, coordinates).some(candidate => candidate.status.isOpen);
}

/**
 * Returns the most relevant status for a shop with multiple addresses.
 * Prefers the selected/closest address when it is open, otherwise falls back
 * to any currently open address, then to the preferred/fallback address.
 */
export function getAddressAwareShopStatus(
  shopWorkingHours: string | null | undefined,
  coordinates?: WorkingHoursCoordinate[] | null,
  preferredIndex?: number,
): ShopStatusResult {
  const candidates = getStatusCandidates(shopWorkingHours, coordinates);

  if (candidates.length === 0) {
    return {
      isOpen: false,
      statusText: 'Закрыто',
      hours: null,
    };
  }

  const preferredCandidate = preferredIndex != null
    ? candidates.find(candidate => candidate.index === preferredIndex)
    : undefined;

  if (preferredCandidate?.status.isOpen) {
    return {
      ...preferredCandidate.status,
      hours: preferredCandidate.hours,
      sourceIndex: preferredCandidate.index,
    };
  }

  const openCandidate = candidates.find(candidate => candidate.status.isOpen);
  if (openCandidate) {
    return {
      ...openCandidate.status,
      hours: openCandidate.hours,
      sourceIndex: openCandidate.index,
    };
  }

  const fallbackCandidate = preferredCandidate ?? candidates[0];
  return {
    ...fallbackCandidate.status,
    hours: fallbackCandidate.hours,
    sourceIndex: fallbackCandidate.index,
  };
}

/**
 * Hook to get real-time shop open status that updates every minute
 */
import { useState, useEffect } from 'react';

export function useShopStatus(openHours: string) {
  const [status, setStatus] = useState(() => getShopStatus(openHours));

  useEffect(() => {
    setStatus(getShopStatus(openHours));

    const interval = setInterval(() => {
      setStatus(getShopStatus(openHours));
    }, 60000);

    return () => clearInterval(interval);
  }, [openHours]);

  return status;
}

export function useAddressAwareShopStatus(
  shopWorkingHours: string | null | undefined,
  coordinates?: WorkingHoursCoordinate[] | null,
  preferredIndex?: number,
) {
  const [status, setStatus] = useState(() => getAddressAwareShopStatus(shopWorkingHours, coordinates, preferredIndex));

  useEffect(() => {
    setStatus(getAddressAwareShopStatus(shopWorkingHours, coordinates, preferredIndex));

    const interval = setInterval(() => {
      setStatus(getAddressAwareShopStatus(shopWorkingHours, coordinates, preferredIndex));
    }, 60000);

    return () => clearInterval(interval);
  }, [shopWorkingHours, coordinates, preferredIndex]);

  return status;
}
