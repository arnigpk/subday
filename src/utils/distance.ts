/**
 * Format distance in meters to human-readable string
 * @param meters - distance in meters
 * @returns formatted string like "500 м" or "1.2 км"
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) {
    return '— м';
  }
  
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }
  
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)} км`;
  }
  
  return `${Math.round(km)} км`;
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds - duration in seconds
 * @returns formatted string like "5 мин" or "1 ч 20 мин"
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) {
    return '— мин';
  }
  
  const minutes = Math.round(seconds / 60);
  
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} ч`;
  }
  
  return `${hours} ч ${remainingMinutes} мин`;
}

/**
 * Sort shops by distance (closest first)
 * Shops without distance are placed at the end
 */
export function sortByDistance<T extends { id: string }>(
  shops: T[],
  distances: Map<string, { distance: number | null }>
): T[] {
  return [...shops].sort((a, b) => {
    const distA = distances.get(a.id)?.distance;
    const distB = distances.get(b.id)?.distance;
    
    // Both have distances - sort by distance
    if (distA != null && distB != null) {
      return distA - distB;
    }
    
    // Only A has distance - A comes first
    if (distA != null) return -1;
    
    // Only B has distance - B comes first
    if (distB != null) return 1;
    
    // Neither has distance - maintain original order
    return 0;
  });
}
