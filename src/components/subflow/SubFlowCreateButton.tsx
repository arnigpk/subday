import { useEffect, useRef, useState } from 'react';
import { Pencil, Image, Video, Paperclip, Camera } from 'lucide-react';

/**
 * Кнопка «Сделать пост» в ленте #subFlow.
 *
 * Кружок с иконкой раскрывается в пилюлю с текстом, держится, сворачивается —
 * и уже в свёрнутом виде иконка сменяется на следующую: карандаш, фото, видео,
 * скрепка, камера, и по кругу. Смена происходит именно в свёрнутом состоянии,
 * иначе текст дёргался бы вместе с иконкой.
 *
 * Размеры заданы в пикселях, а не в долях экрана: кнопка должна выглядеть
 * одинаково и на маленьком телефоне, и на планшете. Ширина текста ограничена,
 * чтобы длинный перевод не растянул пилюлю за край.
 */

const ICONS = [Pencil, Image, Video, Paperclip, Camera] as const;

// Такты цикла в миллисекундах, от начала раскрытия.
const HOLD_OPEN = 2400;   // сколько пилюля стоит раскрытой
const SWAP_AT = 2900;     // момент подмены иконки — кнопка уже свернулась
const CYCLE = 4200;       // полный проход
const SWAP_FADE = 220;    // уход иконки перед подменой

interface Props {
  label: string;
  onClick: () => void;
}

export function SubFlowCreateButton({ label, onClick }: Props) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    const run = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      setOpen(true);
      at(HOLD_OPEN, () => setOpen(false));
      at(SWAP_AT, () => {
        setSwapping(true);
        at(SWAP_FADE, () => {
          setIndex((prev) => (prev + 1) % ICONS.length);
          setSwapping(false);
        });
      });
      at(CYCLE, run);
    };

    run();
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const Icon = ICONS[index];

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed app-floating-above-nav left-1/2 -translate-x-1/2 z-40 flex items-center justify-center h-11 rounded-full font-semibold text-sm text-primary-foreground border-0 active:scale-95"
      style={{
        background: 'hsl(var(--primary))',
        boxShadow: '0 4px 16px hsl(var(--primary) / 0.34)',
        paddingLeft: open ? 19 : 13,
        paddingRight: open ? 19 : 13,
        columnGap: open ? 7 : 0,
        transition: 'padding 420ms cubic-bezier(0.34, 1.4, 0.5, 1), column-gap 420ms cubic-bezier(0.34, 1.4, 0.5, 1), transform 200ms ease',
      }}
    >
      <Icon
        size={18}
        className="shrink-0"
        style={{
          transform: swapping ? 'scale(0.5) rotate(-25deg)' : 'none',
          opacity: swapping ? 0 : 1,
          transition: 'transform 220ms ease, opacity 220ms ease',
        }}
      />
      <span
        className="inline-block overflow-hidden whitespace-nowrap"
        style={{
          maxWidth: open ? 140 : 0,
          opacity: open ? 1 : 0,
          transition: 'max-width 420ms cubic-bezier(0.34, 1.4, 0.5, 1), opacity 300ms ease',
        }}
      >
        {label}
      </span>
    </button>
  );
}
