import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { drinkLabelForStaff } from '@/lib/drinkLabel';

describe('название напитка для кофейни', () => {
  it('прячет оба формата гостевого списания', () => {
    // Именно эти два формата лежат в базе — новый и исторический.
    expect(drinkLabelForStaff('Гостевой кофе от ID:821488')).toBe('Кофе');
    expect(drinkLabelForStaff('Гостевой доступ → ID: 485793')).toBe('Кофе');
    expect(drinkLabelForStaff('Гостевой кофе (subday Go)')).toBe('Кофе');
  });

  it('обычные названия не трогает', () => {
    expect(drinkLabelForStaff('Кофе')).toBe('Кофе');
    expect(drinkLabelForStaff('Ланч')).toBe('Ланч');
    expect(drinkLabelForStaff('Капучино + карамель')).toBe('Капучино + карамель');
  });

  it('переживает пустое значение', () => {
    expect(drinkLabelForStaff(null)).toBe('Кофе');
    expect(drinkLabelForStaff(undefined)).toBe('Кофе');
    expect(drinkLabelForStaff('')).toBe('Кофе');
  });

  it('не срабатывает на словах, которые лишь начинаются похоже', () => {
    expect(drinkLabelForStaff('Гость дома')).toBe('Гость дома');
    expect(drinkLabelForStaff('Негостевой кофе')).toBe('Негостевой кофе');
  });
});

describe('кто маскирует, а кто нет', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('экраны кофейни маскируют', () => {
    for (const p of [
      'pages/partner/PartnerHistoryPage.tsx',
      'pages/partner/BaristaShiftHistory.tsx',
      'pages/partner/PartnerScanPage.tsx',
    ]) {
      expect(src(p).includes('drinkLabelForStaff'), `${p} не маскирует`).toBe(true);
    }
  });

  it('админка и экраны пользователя показывают как есть', () => {
    // Владельцу и самому гостю подробность нужна — там маскировать нельзя.
    for (const p of [
      'pages/admin/AdminHistoryPage.tsx',
      'pages/HistoryPage.tsx',
      'pages/RedeemPage.tsx',
    ]) {
      expect(src(p).includes('drinkLabelForStaff'), `${p} маскирует, а не должен`).toBe(false);
    }
  });
});
