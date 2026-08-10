import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withCap, REFRESH_SPINNER_CAP_MS } from '@/hooks/usePullToRefresh';

// На слабой связи жест «потянуть вниз» выглядел как зависание: кружок крутился,
// пока не упрётся в 20-секундный потолок запросов. Здесь потолок свой, короткий.

describe('обновление потягиванием — потолок ожидания', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('жест завершается по потолку, даже если сеть не ответила вовсе', async () => {
    let done = false;
    const never = new Promise<void>(() => { /* ответа не будет */ });
    withCap(never, REFRESH_SPINNER_CAP_MS).then(() => { done = true; });

    await vi.advanceTimersByTimeAsync(REFRESH_SPINNER_CAP_MS - 100);
    expect(done).toBe(false);           // раньше времени не отпускаем

    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);            // и не залипаем навсегда
  });

  it('быстрое обновление завершает жест сразу, не дожидаясь потолка', async () => {
    let done = false;
    withCap(Promise.resolve(), REFRESH_SPINNER_CAP_MS).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('ошибка обновления не роняет жест и не всплывает непойманной', async () => {
    const rejections: unknown[] = [];
    const onRejection = (e: PromiseRejectionEvent) => rejections.push(e.reason);
    window.addEventListener('unhandledrejection', onRejection);

    let done = false;
    withCap(Promise.reject(new Error('нет сети')), REFRESH_SPINNER_CAP_MS).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(50);

    expect(done).toBe(true);
    expect(rejections).toEqual([]);
    window.removeEventListener('unhandledrejection', onRejection);
  });

  it('обработчик, ничего не вернувший, тоже корректно завершает жест', async () => {
    let done = false;
    withCap(undefined, REFRESH_SPINNER_CAP_MS).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('потолок жеста заметно короче потолка запросов (20 с)', () => {
    expect(REFRESH_SPINNER_CAP_MS).toBeLessThan(20000);
    expect(REFRESH_SPINNER_CAP_MS).toBeGreaterThanOrEqual(5000);
  });
});
