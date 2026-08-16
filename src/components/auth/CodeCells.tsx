import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { OTPInput } from 'input-otp';

/**
 * Ввод кода подтверждения ячейками — общий для входа, регистрации и телеграма.
 *
 * Ячейки нарисованные, а поле под ними одно настоящее. Так задумано в самой
 * библиотеке input-otp, и это важно: на четырёх отдельных input автоподстановка
 * кода из SMS ломается — система не понимает, куда класть цифры. Здесь
 * autoComplete="one-time-code" продолжает работать, как и раньше.
 *
 * Реакция на ответ сервера:
 *   успех  — ячейки зеленеют с коротким подскоком;
 *   ошибка — краснеют, встряхиваются, цифры стираются и курсор встаёт в начало.
 *
 * Очистка при ошибке — не украшение. Раньше неверные цифры оставались в поле, и
 * человеку приходилось стирать их вручную, прежде чем ввести правильные.
 */

export type CodeState = 'idle' | 'ok' | 'error';

export interface CodeCellsHandle {
  /** Показать ошибку: тряска, очистка, курсор в начало. */
  fail: () => void;
  /** Показать успех. */
  succeed: () => void;
}

interface Props {
  length: number;
  value: string;
  onChange: (value: string) => void;
  /** Зовём, когда набрана последняя цифра. */
  onFilled: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Сколько держим подсветку ошибки, прежде чем вернуть поле в обычный вид. */
const ERROR_HOLD_MS = 620;

export const CodeCells = forwardRef<CodeCellsHandle, Props>(function CodeCells(
  { length, value, onChange, onFilled, disabled, autoFocus },
  ref,
) {
  const [state, setState] = useState<CodeState>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    fail() {
      setState('error');
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setState('idle');
        onChange('');
        // Возвращаем курсор в поле, чтобы можно было сразу набирать заново.
        containerRef.current?.querySelector('input')?.focus();
      }, ERROR_HOLD_MS);
    },
    succeed() {
      setState('ok');
    },
  }));

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Новый ввод после ошибки сбрасывает подсветку сразу, не дожидаясь таймера.
  useEffect(() => {
    if (state === 'error' && value.length > 0) setState('idle');
  }, [value, state]);

  const cell = (i: number, char: string, active: boolean) => {
    const base =
      'relative flex items-center justify-center rounded-xl border-[1.5px] bg-card text-2xl font-semibold tabular-nums transition-colors duration-200';
    const size = length > 4 ? 'w-11 h-14' : 'w-[52px] h-16';
    // Только токены темы: accent — фирменный лаймовый, тот же, что на «Ваш QR».
    // Цифры при успехе оставляем тёмными: лайм слишком светлый для текста.
    const look =
      state === 'ok'
        ? 'border-accent bg-accent/15'
        : state === 'error'
          ? 'border-destructive bg-destructive/10 text-destructive'
          : active
            ? 'border-primary'
            : 'border-border';
    const pop = state === 'ok' ? 'animate-pop' : '';
    return (
      <div key={i} className={`${base} ${size} ${look} ${pop}`} style={state === 'ok' ? { animationDelay: `${i * 45}ms` } : undefined}>
        {char}
        {active && state === 'idle' && !char && (
          <span className="pointer-events-none absolute h-6 w-px bg-foreground animate-caret-blink" />
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={state === 'error' ? 'animate-shake' : undefined}>
      <OTPInput
        value={value}
        onChange={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length && !disabled) onFilled(digits);
        }}
        maxLength={length}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        containerClassName="flex items-center justify-center gap-2 has-[:disabled]:opacity-60"
        render={({ slots }) => <>{slots.map((slot, i) => cell(i, slot.char ?? '', slot.isActive))}</>}
      />
    </div>
  );
});
