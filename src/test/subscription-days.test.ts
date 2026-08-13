import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { daysLeft, shiftExpiry } from '@/lib/subscriptionDays';

// Этой арифметикой админка меняет людям дату окончания подписки. Ошибка здесь не
// падает и не видна глазами — просто у кого-то тихо уезжает срок.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-13T12:00:00.000Z').getTime();
const inDays = (n: number) => new Date(NOW + n * DAY).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('сколько дней осталось', () => {
  it('считает так же, как приложение — округляя вверх', () => {
    expect(daysLeft(inDays(8))).toBe(8);
    // Неполный день — всё ещё день, а не ноль: иначе цифра разошлась бы
    // с той, что человек видит на главной.
    expect(daysLeft(new Date(NOW + DAY / 2).toISOString())).toBe(1);
  });

  it('истёкшая подписка — ноль, а не отрицательное число', () => {
    expect(daysLeft(inDays(-5))).toBe(0);
    expect(daysLeft(inDays(-0.1))).toBe(0);
  });

  it('нет срока или мусор вместо даты — ноль, без падения', () => {
    expect(daysLeft(null)).toBe(0);
    expect(daysLeft('не дата')).toBe(0);
  });
});

describe('изменение срока', () => {
  it('сохранение без правок НЕ сдвигает дату', () => {
    // Главная ловушка: показанное число дней округлено вверх. Если писать
    // «сегодня + N дней», каждое сохранение добавляло бы часы.
    const expires = new Date(NOW + 7.4 * DAY).toISOString();
    const shown = daysLeft(expires);            // 8 — округлили вверх
    const next = shiftExpiry(expires, shown, shown);
    expect(next).toBe(new Date(expires).toISOString());
  });

  it('продление добавляет ровно столько дней, сколько прибавили', () => {
    const expires = inDays(10);
    const next = shiftExpiry(expires, 10, 40);
    expect(new Date(next).getTime() - new Date(expires).getTime()).toBe(30 * DAY);
  });

  it('сокращение убирает ровно столько же', () => {
    const expires = inDays(30);
    const next = shiftExpiry(expires, 30, 10);
    expect(new Date(next).getTime() - new Date(expires).getTime()).toBe(-20 * DAY);
  });

  it('время суток сохраняется — дата не «плывёт» по часам', () => {
    const expires = new Date('2026-08-20T07:31:45.000Z').toISOString();
    const next = new Date(shiftExpiry(expires, 7, 37));
    expect(next.getUTCHours()).toBe(7);
    expect(next.getUTCMinutes()).toBe(31);
    expect(next.getUTCSeconds()).toBe(45);
  });

  it('истёкшую подписку продлеваем от сегодня, а не из прошлого', () => {
    const expired = inDays(-20);
    const next = new Date(shiftExpiry(expired, 0, 30)).getTime();
    expect(next).toBe(NOW + 30 * DAY);   // а не NOW + 10 дней
    expect(next).toBeGreaterThan(NOW);
  });

  it('срока не было вовсе — отсчёт от сегодня', () => {
    expect(new Date(shiftExpiry(null, 0, 14)).getTime()).toBe(NOW + 14 * DAY);
  });
});
