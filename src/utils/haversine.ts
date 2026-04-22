/**
 * Unified Haversine distance calculation used across the entire app.
 * Returns distance between two coordinates in METERS.
 *
 * IMPORTANT: This is the single source of truth for distance calculations.
 * Used by:
 *  - useShopDistances (Shops list, Nearby carousel, Shop detail, Redeem)
 *  - useGeoNotifications (proximity-based push notifications)
 *  - any future feature that needs straight-line distance
 *
 * Do NOT inline the formula elsewhere — always import from here.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
