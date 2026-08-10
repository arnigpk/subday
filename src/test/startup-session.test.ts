import { describe, it, expect, beforeEach } from 'vitest';
import { readStoredSession, AUTH_WAIT_CAP_MS } from '@/lib/storedSession';

// Прелоадер крутился по 5–6 раз, потому что старт приложения ждал обновления
// токена по сети. Сохранённая сессия лежит в localStorage — её достаточно, чтобы
// решить, какой экран показать, и не держать человека на анимации.

const KEY = 'sb-abcdefgh-auth-token';

function session(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'jwt',
    refresh_token: 'r',
    user: { id: 'u-1' },
    ...over,
  });
}

describe('сессия из хранилища — старт без ожидания сети', () => {
  beforeEach(() => localStorage.clear());

  it('находит сохранённую сессию по форме ключа', () => {
    localStorage.setItem(KEY, session());
    expect(readStoredSession()?.user?.id).toBe('u-1');
  });

  it('ключ зависит от адреса проекта — ищем по форме, а не по точному имени', () => {
    localStorage.setItem('sb-completely-other-ref-auth-token', session());
    expect(readStoredSession()?.user?.id).toBe('u-1');
  });

  it('нет сессии → null, приложение подождёт сеть', () => {
    expect(readStoredSession()).toBeNull();
  });

  it('чужие ключи не путаются с сессией', () => {
    localStorage.setItem('subday_preloader_cache', '{"config":{"duration":1}}');
    localStorage.setItem('native_scan_ready', '1');
    expect(readStoredSession()).toBeNull();
  });

  it('битое или неполное значение не роняет старт', () => {
    localStorage.setItem(KEY, 'не json');
    expect(readStoredSession()).toBeNull();
    localStorage.setItem(KEY, session({ user: undefined }));
    expect(readStoredSession()).toBeNull();
    localStorage.setItem(KEY, session({ access_token: undefined }));
    expect(readStoredSession()).toBeNull();
  });

  it('потолок ожидания заметно короче того, что видел человек (5–10 с)', () => {
    expect(AUTH_WAIT_CAP_MS).toBeLessThanOrEqual(3000);
  });
});
