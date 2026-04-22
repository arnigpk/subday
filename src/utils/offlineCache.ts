/**
 * Простой localStorage-кеш с TTL для оффлайн-режима.
 *
 * Используется для:
 *  - списка кофеен (TopShopsCarousel, ShopsPage) — кеш на 24ч
 *  - снимка профиля + активной подписки + статистики (для показа QR без сети) — кеш на 24ч
 *
 * НЕ используется для критичных операций (списание/оплата/скан).
 * Все мутации по-прежнему идут через Edge Function/RLS, кеш — только READ.
 */

const PREFIX = 'subday_offline:';

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now(), ttlMs };
    localStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    /* quota exceeded — игнорируем, не критично */
  }
}

export function getCache<T>(key: string): { data: T; cachedAt: number; isStale: boolean } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env: CacheEnvelope<T> = JSON.parse(raw);
    const age = Date.now() - env.cachedAt;
    return { data: env.data, cachedAt: env.cachedAt, isStale: age > env.ttlMs };
  } catch {
    return null;
  }
}

export function clearCache(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

export function clearAllCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}

// Cache keys (single source of truth)
export const CACHE_KEYS = {
  shops: 'shops_v1',
  qrSnapshot: 'qr_snapshot_v1', // user + active subs + stats для показа QR офлайн
} as const;

// TTLs
export const CACHE_TTL = {
  shops: 24 * 60 * 60 * 1000, // 24h
  qrSnapshot: 24 * 60 * 60 * 1000, // 24h
} as const;
