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
  /** Показать успех. Обещание исполнится, когда анимацию можно прерывать. */
  succeed: () => Promise<void>;
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
const ERROR_HOLD_MS = 900;

/**
 * Сколько показываем зелёные ячейки, прежде чем пустить внутрь.
 *
 * Ждём таймером в браузере у человека — сервер об этой паузе не знает и
 * ничего лишнего не делает. Сколько бы людей ни входило одновременно,
 * нагрузка не меняется: запрос к серверу уже завершён, мы просто
 * придерживаем переход на экран приложения.
 */
const SUCCESS_HOLD_MS = 700;

export const CodeCells = forwardRef<CodeCellsHandle, Props>(function CodeCells(
  { length, value, onChange, onFilled, disabled, autoFocus },
  ref,
) {
  const [state, setState] = useState<CodeState>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const failedValue = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    fail() {
      // Запоминаем, на каком коде споткнулись. Без этого подсветка снималась
      // в тот же кадр: в поле уже лежит неверный код, и условие «человек начал
      // править» срабатывало мгновенно — тряски никто не успевал увидеть.
      failedValue.current = value;
      setState('error');
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setState('idle');
        failedValue.current = null;
        onChange('');
        // Возвращаем курсор в поле, чтобы можно было сразу набирать заново.
        containerRef.current?.querySelector('input')?.focus();
      }, ERROR_HOLD_MS);
    },
    succeed() {
      setState('ok');
      // Отдаём обещание, чтобы экран дождался анимации и только потом входил.
      // Иначе смена сессии перерисовывает всё за миллисекунды и зелёного не
      // видно. Ждём таймером в браузере — сервер об этом не знает, на нагрузку
      // не влияет, сколько бы людей ни входило одновременно.
      return new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = window.setTimeout(resolve, SUCCESS_HOLD_MS);
      });
    },
  }), [value, onChange]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Подсветку ошибки снимаем, когда человек действительно изменил код, —
  // а не в тот же миг, когда мы её показали.
  useEffect(() => {
    if (state === 'error' && failedValue.current !== null && value !== failedValue.current) {
      failedValue.current = null;
      setState('idle');
    }
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
    <div ref={containerRef} className={state === 'error' ? 'animate-shake-code' : undefined}>
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
