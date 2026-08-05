import { useEffect, useRef } from 'react';

/**
 * Свайп «назад» от левого края (iOS-подобный жест).
 * Надёжность: считаем жест только если он начался у самого края, одним пальцем,
 * ушёл заметно вправо и ПРЕИМУЩЕСТВЕННО горизонтально (чтобы не срабатывать при
 * вертикальном скролле/каруселях). Без жёсткого лимита времени — медленный свайп
 * тоже должен сработать. Порог/edge вынесены в константы.
 */
const EDGE_PX = 32;        // старт не дальше 32px от левого края
const MIN_DX = 70;         // минимальный горизонтальный сдвиг вправо
const MAX_DY = 70;         // максимальный вертикальный «увод»
const MAX_MS = 1000;       // защитный верхний предел длительности жеста

export function useSwipeBack(onSwipeBack: () => void) {
  // держим актуальный колбэк без пересоздания слушателей
  const cb = useRef(onSwipeBack);
  cb.current = onSwipeBack;

  useEffect(() => {
    let startX = 0, startY = 0, startT = 0, tracking = false;

    const onStart = (e: TouchEvent) => {
      // мультитач (зум/пинч по QR) — не жест «назад»
      if (e.touches.length !== 1) { tracking = false; return; }
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; startT = Date.now();
      tracking = startX <= EDGE_PX; // трекаем только если начали у левого края
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      // вправо достаточно далеко + почти горизонтально + не абсурдно долго
      if (dx > MIN_DX && Math.abs(dy) < MAX_DY && Math.abs(dx) > Math.abs(dy) * 2 && dt < MAX_MS) {
        cb.current();
      }
    };

    // если палец «сбросили» (system gesture перехватил) — прекращаем трекинг
    const onCancel = () => { tracking = false; };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, []);
}
