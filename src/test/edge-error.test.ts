import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { edgeErrorText } from '@/lib/edgeError';

/**
 * Из-за этого владелец видел «Ошибка проверки кода» вместо причины: сервер
 * отвечает на неверный код статусом 400, а supabase-js прячет тело ответа
 * в error, оставляя data пустым. Сообщение сервера до экрана не доходило.
 */

const FALLBACK = 'Неправильный код, попробуйте ещё раз';

describe('текст ошибки из edge-функции', () => {
  it('берёт сообщение из context.json', () => {
    const err = { context: { json: { error: 'Неверный код. Осталось попыток: 3' } } };
    expect(edgeErrorText(err, FALLBACK)).toBe('Неверный код. Осталось попыток: 3');
  });

  it('берёт сообщение из context.body строкой', () => {
    const err = { context: { body: JSON.stringify({ error: 'Слишком много попыток. Запросите новый код.' }) } };
    expect(edgeErrorText(err, FALLBACK)).toBe('Слишком много попыток. Запросите новый код.');
  });

  it('берёт сообщение из message, если это JSON', () => {
    const err = { message: JSON.stringify({ error: 'Неверный или истёкший код. Запросите новый код в боте.' }) };
    expect(edgeErrorText(err, FALLBACK)).toBe('Неверный или истёкший код. Запросите новый код в боте.');
  });

  it('прячет служебные сообщения библиотеки', () => {
    // Такое человеку показывать нельзя — это внутренняя кухня supabase-js.
    for (const m of [
      'Edge Function returned a non-2xx status code',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
    ]) {
      expect(edgeErrorText({ message: m }, FALLBACK)).toBe(FALLBACK);
    }
  });

  it('отдаёт запасной текст, когда разобрать нечего', () => {
    expect(edgeErrorText(null, FALLBACK)).toBe(FALLBACK);
    expect(edgeErrorText({}, FALLBACK)).toBe(FALLBACK);
    expect(edgeErrorText({ context: { body: 'не json' } }, FALLBACK)).toBe(FALLBACK);
  });

  it('не падает на неожиданной форме', () => {
    expect(() => edgeErrorText({ context: null }, FALLBACK)).not.toThrow();
    expect(() => edgeErrorText('строка', FALLBACK)).not.toThrow();
  });
});

describe('экраны входа показывают причину, а не заглушку', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('все три экрана разбирают ошибку сервера', () => {
    for (const p of [
      'components/auth/LoginScreen.tsx',
      'components/auth/RegisterScreen.tsx',
      'components/auth/TelegramLoginButton.tsx',
    ]) {
      expect(src(p).includes('edgeErrorText(error'), `${p}: показывает заглушку`).toBe(true);
    }
  });

  it('старая общая заглушка убрана из проверки кода', () => {
    for (const p of ['components/auth/LoginScreen.tsx', 'components/auth/RegisterScreen.tsx']) {
      expect(src(p).includes("toast.error('Ошибка проверки кода')"), `${p}: заглушка осталась`).toBe(false);
    }
  });
});

describe('выход из приложения', () => {
  const src = readFileSync(join(__dirname, '..', 'pages/ProfilePage.tsx'), 'utf8');

  it('при отказе сервера закрывает сессию локально', () => {
    // Сервер отвечает 403 session_not_found, когда сессии у него уже нет.
    // Показывать «Ошибка выхода» в этот момент — обманывать человека.
    expect(src).toContain("signOut({ scope: 'local' })");
  });

  it('ошибку показывает, только если сессия действительно осталась', () => {
    const i = src.indexOf("scope: 'local'");
    const after = src.slice(i, i + 500);
    expect(after).toContain('getSession()');
    expect(after).toContain('profile.logoutError');
  });
});
