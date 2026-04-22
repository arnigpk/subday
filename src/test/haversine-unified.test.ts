import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { haversineDistanceMeters } from '@/utils/haversine';

/**
 * Guard test: ensures the entire app uses ONE Haversine implementation.
 *
 * Goal: prevent silent drift between "shop distance" UI (Nearby/Shops/Detail)
 * and the geo-notification proximity check.
 *
 * Rules:
 *  1. Only `src/utils/haversine.ts` may define a Haversine function.
 *  2. Every consumer must import `haversineDistanceMeters` from `@/utils/haversine`.
 */

const ROOT = join(process.cwd(), 'src');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

describe('Unified Haversine distance', () => {
  it('produces a known correct distance (sanity check)', () => {
    // Atyrau (51.92, 47.10) -> Almaty (43.25, 76.92) ≈ 2400 km
    const meters = haversineDistanceMeters(51.92, 47.1, 43.25, 76.92);
    expect(meters).toBeGreaterThan(2_350_000);
    expect(meters).toBeLessThan(2_500_000);
  });

  it('is symmetric and zero for identical points', () => {
    expect(haversineDistanceMeters(0, 0, 0, 0)).toBe(0);
    const ab = haversineDistanceMeters(10, 20, 30, 40);
    const ba = haversineDistanceMeters(30, 40, 10, 20);
    expect(Math.abs(ab - ba)).toBeLessThan(1e-6);
  });

  it('useShopDistances imports the shared utility', () => {
    const src = read('hooks/useShopDistances.ts');
    expect(src).toMatch(/from\s+['"]@\/utils\/haversine['"]/);
    expect(src).toMatch(/haversineDistanceMeters/);
  });

  it('useGeoNotifications imports the shared utility', () => {
    const src = read('hooks/useGeoNotifications.ts');
    expect(src).toMatch(/from\s+['"]@\/utils\/haversine['"]/);
    expect(src).toMatch(/haversineDistanceMeters/);
  });

  it('no other file redefines a Haversine function', () => {
    const filesToCheck = [
      'hooks/useShopDistances.ts',
      'hooks/useGeoNotifications.ts',
      'utils/distance.ts',
    ];
    for (const file of filesToCheck) {
      const src = read(file);
      // No local function declaration with "haversine" in its name
      expect(src).not.toMatch(/function\s+haversine/i);
    }
  });
});
