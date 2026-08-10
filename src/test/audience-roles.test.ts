import { describe, it, expect } from 'vitest';
import { audienceOptions, type AudienceType } from '@/components/admin/AudienceTypeSelector';

// Рассылки по рабочим ролям нужны для служебных сообщений: правила списания,
// обновление приложения, объявления для точек. Гостям такое не уходит.

describe('аудитории рассылки — партнёры и бариста', () => {
  it('оба варианта есть в списке выбора', () => {
    const values = audienceOptions.map(o => o.value);
    expect(values).toContain('partners');
    expect(values).toContain('baristas');
  });

  it('подписаны понятно для человека', () => {
    const byValue = Object.fromEntries(audienceOptions.map(o => [o.value, o]));
    expect(byValue.partners.label).toBe('Партнёры');
    expect(byValue.baristas.label).toBe('Бариста');
    expect(byValue.partners.description).toBeTruthy();
    expect(byValue.baristas.description).toBeTruthy();
  });

  it('прежние аудитории на месте — ничего не вытеснено', () => {
    const values = audienceOptions.map(o => o.value);
    for (const v of ['all', 'subscribers', 'no_subscription', 'expiring_soon', 'new_users', 'inactive']) {
      expect(values).toContain(v as AudienceType);
    }
    expect(values.length).toBe(8);
  });

  it('значения не повторяются', () => {
    const values = audienceOptions.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('у каждого варианта есть иконка — вёрстка списка не поедет', () => {
    for (const o of audienceOptions) expect(o.icon).toBeTruthy();
  });
});
