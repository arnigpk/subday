import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

// Дирижёр полноэкранных оверлеев: показываем строго ПО ОДНОМУ, по приоритету.
// Зачем: у нового пользователя онбординг, спецпредложение и сообщение открывались
// одновременно. Radix-диалог спецпредложения ставит pointer-events:none на body и
// focus-trap вне своего портала → кнопки онбординга переставали реагировать
// («онбординг виснет»). Плюс скрытые под онбордингом попап/сообщение «сгорали»
// (offer помечался показанным, просмотры накручивались), хотя их никто не видел.
//
// Теперь младшие оверлеи НЕ рендерятся, пока активен старший.

export type OverlayId = 'onboarding' | 'specialOffer' | 'appMessage';

// Порядок = приоритет (первый — самый главный).
export const OVERLAY_PRIORITY: OverlayId[] = ['onboarding', 'specialOffer', 'appMessage'];

/** Чистая функция выбора активного оверлея — вынесена для тестируемости. */
export function resolveActiveOverlay(wanting: Partial<Record<OverlayId, boolean>>): OverlayId | null {
  return OVERLAY_PRIORITY.find(id => wanting[id]) ?? null;
}

interface OverlayCtxValue {
  active: OverlayId | null;
  request: (id: OverlayId, wants: boolean) => void;
}

const OverlayCtx = createContext<OverlayCtxValue>({ active: null, request: () => {} });

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [wanting, setWanting] = useState<Partial<Record<OverlayId, boolean>>>({});

  const request = useCallback((id: OverlayId, wants: boolean) => {
    setWanting(prev => (prev[id] === wants ? prev : { ...prev, [id]: wants }));
  }, []);

  const active = useMemo(() => resolveActiveOverlay(wanting), [wanting]);
  const value = useMemo(() => ({ active, request }), [active, request]);

  return <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>;
}

/**
 * Слот оверлея: сообщаем, что хотим показаться, и получаем разрешение.
 * Возвращает true ТОЛЬКО если этот оверлей сейчас старший из желающих.
 * При размонтировании заявка снимается — очередь двигается дальше.
 */
export function useOverlaySlot(id: OverlayId, wants: boolean): boolean {
  const { active, request } = useContext(OverlayCtx);

  useEffect(() => { request(id, wants); }, [id, wants, request]);
  useEffect(() => () => { request(id, false); }, [id, request]);

  return active === id;
}
