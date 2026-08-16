import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CodeCells, type CodeCellsHandle } from '@/components/auth/CodeCells';

/**
 * Главное, что проверяем, — поведение при неверном коде. Раньше цифры
 * оставались в поле, и человеку приходилось стирать их вручную. Теперь поле
 * само очищается и возвращает курсор, чтобы можно было сразу набрать заново.
 * Никаких перезагрузок и переходов при этом быть не должно.
 */

function setup(length = 4, value = '') {
  const ref = createRef<CodeCellsHandle>();
  const onChange = vi.fn();
  const onFilled = vi.fn();
  const utils = render(
    <CodeCells ref={ref} length={length} value={value} onChange={onChange} onFilled={onFilled} />,
  );
  return { ref, onChange, onFilled, ...utils };
}

describe('ячейки ввода кода', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('рисует столько ячеек, сколько цифр в коде', () => {
    const { container, unmount } = setup(4);
    expect(container.querySelectorAll('[class*="rounded-xl"]').length).toBe(4);
    unmount();
    const six = setup(6);
    expect(six.container.querySelectorAll('[class*="rounded-xl"]').length).toBe(6);
  });

  it('под ячейками одно настоящее поле — иначе сломается автоподстановка из SMS', () => {
    const { container } = setup(4);
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(1);
    expect(inputs[0].getAttribute('autocomplete')).toBe('one-time-code');
  });

  it('при ошибке очищает поле, чтобы не стирать цифры вручную', () => {
    const { ref, onChange } = setup(4, '1234');
    act(() => { ref.current?.fail(); });
    // Сначала держим подсветку — человек должен успеть увидеть, что не так.
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(700); });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('успех не очищает поле', () => {
    const { ref, onChange } = setup(4, '1234');
    act(() => { ref.current?.succeed(); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('зовёт onFilled ровно когда набрана последняя цифра', () => {
    const { onFilled, rerender, ref } = setup(4, '123');
    expect(onFilled).not.toHaveBeenCalled();
    // Имитируем ввод четвёртой цифры через настоящее поле.
    const input = document.querySelector('input') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '1234');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onFilled).toHaveBeenCalledWith('1234');
    void rerender; void ref;
  });
});

describe('экраны входа используют общие ячейки', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('вход, регистрация и телеграм — все на CodeCells', () => {
    for (const p of [
      'components/auth/LoginScreen.tsx',
      'components/auth/RegisterScreen.tsx',
      'components/auth/TelegramLoginButton.tsx',
    ]) {
      expect(src(p).includes('<CodeCells'), `${p} не использует общий компонент`).toBe(true);
    }
  });

  it('каждый экран показывает и успех, и ошибку', () => {
    for (const p of [
      'components/auth/LoginScreen.tsx',
      'components/auth/RegisterScreen.tsx',
      'components/auth/TelegramLoginButton.tsx',
    ]) {
      const s = src(p);
      expect(s.includes('cellsRef.current?.fail()'), `${p}: нет реакции на ошибку`).toBe(true);
      expect(s.includes('cellsRef.current?.succeed()'), `${p}: нет реакции на успех`).toBe(true);
    }
  });

  it('при неверном коде никуда не перекидывает и не перезагружает', () => {
    for (const p of [
      'components/auth/LoginScreen.tsx',
      'components/auth/RegisterScreen.tsx',
      'components/auth/TelegramLoginButton.tsx',
    ]) {
      const s = src(p);
      expect(/location\.reload|location\.href|window\.location/.test(s), `${p}: есть перезагрузка`).toBe(false);
    }
  });

  it('код телеграма остаётся шестизначным', () => {
    // В telegram-verify-code нет ограничения попыток, короткий код был бы
    // перебираемым. Длину менять нельзя, пока защита не добавлена.
    expect(src('components/auth/TelegramLoginButton.tsx')).toContain('length={6}');
  });
});
